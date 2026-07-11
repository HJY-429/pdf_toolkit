import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';
import { loadPdf, renderPage } from '../core/pdfjs';

// M2：PDF 转图片（纯前端，pdf.js）
// 逐页渲染为 PNG，输出多个图片文件。
const pdfToImage: Tool = {
  id: 'pdf-to-image',
  title: 'PDF 转图片',
  description: '将 PDF 每一页渲染为 PNG 图片（可批量下载）',
  accept: ['application/pdf'],
  fields: [
    {
      key: 'scale',
      label: '清晰度',
      type: 'select',
      default: '1.5',
      options: [
        { label: '标准 1x', value: '1' },
        { label: '清晰 1.5x', value: '1.5' },
        { label: '高清 2x', value: '2' },
      ],
    },
  ],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const scale = Number(options.scale ?? 1.5);
    const bytes = await files[0].arrayBuffer();
    const doc = await loadPdf(bytes);
    const total = doc.numPages;
    const result: ToolOutput = [];
    const base = files[0].name;

    for (let i = 1; i <= total; i++) {
      const { canvas } = await renderPage(doc, i, scale);
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
      result.push({ blob, name: deriveName(base, `page-${i}`, 'png') });
      ctx?.onProgress?.(i / total, `导出第 ${i}/${total} 页`);
    }
    return result;
  },
};

registry.register(pdfToImage);
export default pdfToImage;
