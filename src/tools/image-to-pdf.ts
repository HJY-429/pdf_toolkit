import { PDFDocument } from 'pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M2：图片转 PDF（纯前端，pdf-lib）
// 支持 PNG / JPG，可多选；每张图片占一页，页面尺寸贴合图片原始尺寸。
const imageToPdf: Tool = {
  id: 'image-to-pdf',
  title: '图片转 PDF',
  description: '将一张或多张图片（PNG/JPG）合并为一个 PDF，每图一页',
  accept: ['image/png', 'image/jpeg'],
  multiple: true,
  workerSafe: true,
  async run({ files }: ToolInput, ctx): Promise<ToolOutput> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      const bytes = new Uint8Array(await files[i].arrayBuffer());
      let img;
      if (files[i].type === 'image/png') img = await doc.embedPng(bytes);
      else img = await doc.embedJpg(bytes);
      const page = doc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      ctx?.onProgress?.((i + 1) / files.length, `处理第 ${i + 1}/${files.length} 张`);
    }
    const saved = await doc.save();
    const name = deriveName(files[0].name, 'from-image');
    return [{ blob: new Blob([saved], { type: 'application/pdf' }), name }];
  },
};

registry.register(imageToPdf);
export default imageToPdf;
