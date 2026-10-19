/**
 * =============================================================================
 * 奇妙机关工坊 Contraption Lab
 * 文件名: share.ts
 * -----------------------------------------------------------------------------
 * 用途: 分享与备份工具（设计文档 §8.7/D8）
 *       - .clab 单关文件：关卡 JSON + 版本号 + 校验和（损坏拒绝导入）
 *       - .db 整库备份：SQLite 字节流直接落盘（恢复=整库替换，覆盖前确认）
 *       纯函数部分（checksum/parse）可单测。
 * 作者: Anttu
 * 创建日期: 2026-10-18
 * =============================================================================
 */
import type { LevelDoc } from '../level/types';

/** .clab 文件结构 */
export interface ClabFile {
  kind: 'contraption-lab-level';
  version: 1;
  checksum: number;
  level: LevelDoc;
}

/** FNV-1a 简易校验和（纯函数） */
export function checksum(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 序列化为 .clab 内容（纯函数） */
export function encodeClab(level: LevelDoc): string {
  const file: ClabFile = {
    kind: 'contraption-lab-level',
    version: 1,
    checksum: checksum(JSON.stringify(level)),
    level,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * 解析 .clab 内容（纯函数）
 * @returns 关卡文档
 * @throws 格式/校验和不符时抛错（调用方提示用户）
 */
export function parseClab(raw: string): LevelDoc {
  let file: ClabFile;
  try {
    file = JSON.parse(raw) as ClabFile;
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  if (file.kind !== 'contraption-lab-level' || !file.level) {
    throw new Error('不是奇妙的关卡文件（.clab）');
  }
  if (file.checksum !== checksum(JSON.stringify(file.level))) {
    throw new Error('文件已损坏（校验和不符）');
  }
  return file.level;
}

/** 浏览器下载文本文件 */
export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 浏览器选择并读取文本文件 */
export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

/** 浏览器下载二进制文件（.db 备份用） */
export function downloadBytes(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.slice()], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 浏览器选择并读取二进制文件 */
export function pickBinaryFile(accept: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
}

/**
 * 移动端系统分享（微信/钉钉内 navigator.share 可调起系统面板；不支持时降级复制链接）
 * @returns 'shared' 系统面板 | 'copied' 已复制到剪贴板 | 'unsupported' 提示用户截图
 */
export async function mobileShare(title: string, url: string): Promise<'shared' | 'copied' | 'unsupported'> {
  // 微信/钉钉内置浏览器不支持 navigator.share → 降级剪贴板
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch {
      // 用户取消分享面板 → 静默
      return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'unsupported';
  }
}

/** 微信/钉钉内置浏览器检测（提示文案用） */
export function isInWeChatOrDingTalk(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('micromessenger') || ua.includes('dingtalk');
}
