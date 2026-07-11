import { PDFDocument } from 'pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M1：多 PDF 合并（纯前端，pdf-lib）
// 文件顺序由 UI 拖拽排序决定，这里按传入顺序合并。
const mergePdf: Tool = {
  id: 'merge-pdf',
  title: 'PDF 合并',
  description: '将多个 PDF 按指定顺序合并为单一 PDF（全程浏览器内完成，文件不上传）',
  accept: ['application/pdf'],
  multiple: true,
  workerSafe: true,
  async run({ files }: ToolInput, ctx): Promise<ToolOutput> {
    const out = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      const bytes = await files[i].arrayBuffer();
      const src = await PDFDocument.load(bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
      ctx?.onProgress?.((i + 1) / files.length, `合并第 ${i + 1}/${files.length} 个`);
    }
    const saved = await out.save();
    const name = deriveName(files[0].name, 'merged');
    return [{ blob: new Blob([saved], { type: 'application/pdf' }), name }];
  },
};

registry.register(mergePdf);
export default mergePdf;
