import { PDFDocument } from 'pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

type Mode = 'each' | 'fixed' | 'range';

/** 解析自定义范围，如 "1-3,5,7-9" -> [[0,2],[4,4],[6,8]]（0 基） */
function parseRanges(spec: string, total: number): [number, number][] {
  const out: [number, number][] = [];
  for (const part of spec.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    if (seg.includes('-')) {
      const [a, b] = seg.split('-').map((x) => parseInt(x, 10) - 1);
      if (!isNaN(a) && !isNaN(b)) out.push([Math.max(0, a), Math.min(total - 1, b)]);
    } else {
      const n = parseInt(seg, 10) - 1;
      if (!isNaN(n)) out.push([n, n]);
    }
  }
  return out;
}

// M1：PDF 拆分（纯前端，pdf-lib）
const splitPdf: Tool = {
  id: 'split-pdf',
  title: 'PDF 拆分',
  description: '按「每页一个 / 固定页数 / 自定义页码范围」拆分为多个 PDF',
  accept: ['application/pdf'],
  workerSafe: true,
  fields: [
    {
      key: 'mode',
      label: '拆分方式',
      type: 'select',
      default: 'each',
      options: [
        { label: '每页一个文件', value: 'each' },
        { label: '固定页数每 N 页一个', value: 'fixed' },
        { label: '自定义页码范围', value: 'range' },
      ],
    },
    {
      key: 'fixed',
      label: '每文件页数（方式=固定时生效）',
      type: 'number',
      default: 2,
      min: 1,
      max: 999,
    },
    {
      key: 'range',
      label: '页码范围，如 1-3,5,7-9',
      type: 'text',
      placeholder: '1-3,5,7-9',
    },
  ],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const mode = options.mode as Mode;
    const bytes = await files[0].arrayBuffer();
    const src = await PDFDocument.load(bytes);
    const total = src.getPageIndices().length;

    let groups: [number, number][] = [];
    if (mode === 'each') {
      for (let i = 0; i < total; i++) groups.push([i, i]);
    } else if (mode === 'fixed') {
      const n = Math.max(1, Number(options.fixed) || 1);
      for (let i = 0; i < total; i += n) groups.push([i, Math.min(i + n - 1, total - 1)]);
    } else {
      groups = parseRanges(String(options.range || ''), total);
      if (groups.length === 0) throw new Error('自定义范围解析失败，请检查格式');
    }

    const result: ToolOutput = [];
    for (let g = 0; g < groups.length; g++) {
      const [start, end] = groups[g];
      const out = await PDFDocument.create();
      const idx = Array.from({ length: end - start + 1 }, (_, k) => start + k);
      const pages = await out.copyPages(src, idx);
      pages.forEach((p) => out.addPage(p));
      const saved = await out.save();
      const name = deriveName(files[0].name, `p${start + 1}-${end + 1}`);
      result.push({ blob: new Blob([saved], { type: 'application/pdf' }), name });
      ctx?.onProgress?.((g + 1) / groups.length, `拆分第 ${g + 1}/${groups.length} 组`);
    }
    return result;
  },
};

registry.register(splitPdf);
export default splitPdf;
