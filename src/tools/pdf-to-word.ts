import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';
import { loadPdf, extractPageText } from '../core/pdfjs';

// M3：PDF → Word（文本级）
// 思路：pdf.js 按页提取文本层（含按行聚合），用 docx 生成 .docx，每页之间插入分页。
// 说明：仅文本与基础换行，无原排版/图片/字体还原（即"文本级"）；扫描件无文本层时为空白。
const pdfToWord: Tool = {
  id: 'pdf-to-word',
  title: 'PDF 转 Word（文本级）',
  description: '从 PDF 提取文本层并生成 .docx（保留文字与换行，不含原排版/图片，适合可复制文本型 PDF）',
  accept: ['application/pdf'],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const bytes = await files[0].arrayBuffer();
    const doc = await loadPdf(bytes);
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const total = doc.numPages;
    const children: Paragraph[] = [];

    for (let i = 1; i <= total; i++) {
      ctx?.onProgress?.(i / total, `提取第 ${i}/${total} 页…`);
      const text = await extractPageText(doc, i);
      children.push(new Paragraph({ children: [new TextRun(text || ' ')] }));
      if (i < total) {
        // 插入空白分页段落，使下一页内容另起一页
        children.push(new Paragraph({ children: [new TextRun('')], pageBreakBefore: true }));
      }
    }

    const docxDoc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(docxDoc);
    const name = deriveName(files[0].name, 'text', 'docx');
    return [{ blob, name }];
  },
};

registry.register(pdfToWord);
export default pdfToWord;
