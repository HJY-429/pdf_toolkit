import { PDFDocument } from 'pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';
import { loadPdf, renderPage } from '../core/pdfjs';

// M2：PDF 压缩（纯前端）
// 思路：用 PDF.js 将每页重绘为低分辨率 JPEG，再重新拼成 PDF。
// 对扫描件/图片型 PDF 压缩效果明显；对纯矢量文本 PDF 可能不降反增，属已知取舍。
const compressPdf: Tool = {
  id: 'compress-pdf',
  title: 'PDF 压缩',
  description: '将每页重绘为低清 JPEG 重新拼合，显著减小扫描件/图片型 PDF 体积',
  accept: ['application/pdf'],
  fields: [
    {
      key: 'quality',
      label: '压缩强度',
      type: 'select',
      default: 'mid',
      options: [
        { label: '轻度（清晰优先）', value: 'low' },
        { label: '中度（推荐）', value: 'mid' },
        { label: '强力（体积优先）', value: 'high' },
      ],
    },
  ],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const scaleMap: Record<string, number> = { low: 1.0, mid: 0.7, high: 0.5 };
    const scale = scaleMap[String(options.quality)] ?? 0.7;
    const bytes = await files[0].arrayBuffer();
    const src = await loadPdf(bytes);
    try {
      const total = src.numPages;
      const out = await PDFDocument.create();

      for (let i = 1; i <= total; i++) {
        const page = await src.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const { canvas } = await renderPage(src, i, scale);
        const jpgBlob = await new Promise<Blob>((res, rej) =>
          canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob 失败'))), 'image/jpeg', 0.8),
        );
        const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
        const img = await out.embedJpg(jpgBytes);
        const p = out.addPage([vp.width, vp.height]);
        p.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
        ctx?.onProgress?.(i / total, `压缩第 ${i}/${total} 页`);
      }
      const saved = await out.save();
      const name = deriveName(files[0].name, 'compressed');
      return [{ blob: new Blob([saved], { type: 'application/pdf' }), name }];
    } finally {
      src.destroy().catch(() => {});
    }
  },
};

registry.register(compressPdf);
export default compressPdf;
