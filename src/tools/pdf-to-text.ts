import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';
import { loadPdf, extractText } from '../core/pdfjs';

// M2：PDF 提取文本（纯前端，pdf.js）
// 将全部页面文本提取为 .txt 文件。注：扫描件（图片型 PDF）无文本层时结果为空。
const pdfToText: Tool = {
  id: 'pdf-to-text',
  title: 'PDF 提取文本',
  description: '提取 PDF 中的文本层内容并导出为 .txt（扫描件无文本层时可能为空）',
  accept: ['application/pdf'],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const bytes = await files[0].arrayBuffer();
    const doc = await loadPdf(bytes);
    const text = await extractText(doc, (r) => ctx?.onProgress?.(r));
    const name = deriveName(files[0].name, 'text', 'txt');
    return [{ blob: new Blob([text], { type: 'text/plain' }), name }];
  },
};

registry.register(pdfToText);
export default pdfToText;
