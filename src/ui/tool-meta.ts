// UI 展示元数据：集中维护每个工具的图标、所属分类。
// 与设计解耦——新增工具只需在下方补充一行，无需改动各工具文件。

export interface CategoryDef {
  key: string;
  label: string;
  icon: string;
}

/** 分类顺序即首页展示顺序 */
export const CATEGORIES: CategoryDef[] = [
  { key: 'merge', label: '合并与拆分', icon: '🧩' },
  { key: 'edit', label: '页面编辑', icon: '🎨' },
  { key: 'convert', label: '格式转换', icon: '🔁' },
  { key: 'secure', label: '安全加密', icon: '🛡️' },
  { key: 'optimize', label: '优化压缩', icon: '⚡' },
];

/** 工具 id -> 图标 + 分类 */
export const TOOL_META: Record<string, { icon: string; category: string }> = {
  merge: { icon: '🔗', category: 'merge' },
  split: { icon: '✂️', category: 'merge' },

  rotate: { icon: '↻', category: 'edit' },
  watermark: { icon: '💧', category: 'edit' },
  pagenumber: { icon: '🔢', category: 'edit' },

  'image-to-pdf': { icon: '🖼️', category: 'convert' },
  'pdf-to-image': { icon: '📸', category: 'convert' },
  'pdf-to-text': { icon: '📝', category: 'convert' },
  'word-to-pdf': { icon: '📄', category: 'convert' },
  'excel-to-pdf': { icon: '📊', category: 'convert' },
  'pdf-to-word': { icon: '📃', category: 'convert' },
  'html-to-pdf': { icon: '🌐', category: 'convert' },

  encrypt: { icon: '🔒', category: 'secure' },
  decrypt: { icon: '🔓', category: 'secure' },

  compress: { icon: '🗜️', category: 'optimize' },
};

export function metaOf(id: string): { icon: string; category: string } {
  return TOOL_META[id] ?? { icon: '📦', category: 'convert' };
}
