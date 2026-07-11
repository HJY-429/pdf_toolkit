import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M2：PDF 页码（纯前端，pdf-lib）
// 在每页指定位置添加页码（数字，标准字体安全渲染）。
const pagenumberPdf: Tool = {
  id: 'pagenumber-pdf',
  title: 'PDF 页码',
  description: '为每页添加页码（数字），可选位置：右下 / 底部居中 / 右上',
  accept: ['application/pdf'],
  workerSafe: true,
  fields: [
    {
      key: 'position',
      label: '页码位置',
      type: 'select',
      default: 'bottom-right',
      options: [
        { label: '右下角', value: 'bottom-right' },
        { label: '底部居中', value: 'bottom-center' },
        { label: '右上角', value: 'top-right' },
      ],
    },
  ],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const pos = String(options.position || 'bottom-right');
    const bytes = await files[0].arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const size = 12;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const num = String(i + 1);
      const tw = font.widthOfTextAtSize(num, size);
      let x = width - tw - 24;
      let y = 20;
      if (pos === 'bottom-center') x = (width - tw) / 2;
      else if (pos === 'top-right') {
        x = width - tw - 24;
        y = height - 24;
      }
      page.drawText(num, { x, y, size, font, color: rgb(0.3, 0.3, 0.3) });
      ctx?.onProgress?.((i + 1) / pages.length, `编页码第 ${i + 1}/${pages.length} 页`);
    }
    const saved = await doc.save();
    const name = deriveName(files[0].name, 'paged');
    return [{ blob: new Blob([saved], { type: 'application/pdf' }), name }];
  },
};

registry.register(pagenumberPdf);
export default pagenumberPdf;
