import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M2：PDF 水印（纯前端，pdf-lib）
// 在每页平铺斜向半透明文字水印。注：标准字体仅支持英文/数字，
// 中文水印需嵌入 CJK 字体（见开发日志，后续可扩展）。
const watermarkPdf: Tool = {
  id: 'watermark-pdf',
  title: 'PDF 水印',
  description: '为每页添加平铺斜向半透明文字水印（当前使用标准字体，支持英文/数字）',
  accept: ['application/pdf'],
  workerSafe: true,
  fields: [
    { key: 'text', label: '水印文字', type: 'text', default: 'CONFIDENTIAL', placeholder: '如 CONFIDENTIAL' },
    {
      key: 'opacity',
      label: '不透明度',
      type: 'select',
      default: '0.2',
      options: [
        { label: '浅 (0.15)', value: '0.15' },
        { label: '中 (0.25)', value: '0.25' },
        { label: '深 (0.4)', value: '0.4' },
      ],
    },
  ],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const text = String(options.text || 'CONFIDENTIAL');
    const opacity = Number(options.opacity ?? 0.2);
    const bytes = await files[0].arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const size = 28;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const stepX = 220;
      const stepY = 140;
      for (let y = -height; y < height * 2; y += stepY) {
        for (let x = -width; x < width * 2; x += stepX) {
          page.drawText(text, {
            x,
            y,
            size,
            font,
            color: rgb(0.5, 0.5, 0.5),
            opacity,
            rotate: degrees(45),
          });
        }
      }
      ctx?.onProgress?.((i + 1) / pages.length, `加水印第 ${i + 1}/${pages.length} 页`);
    }
    const saved = await doc.save();
    const name = deriveName(files[0].name, 'watermarked');
    return [{ blob: new Blob([saved], { type: 'application/pdf' }), name }];
  },
};

registry.register(watermarkPdf);
export default watermarkPdf;
