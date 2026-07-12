import { PDFDocument } from 'pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M2：PDF 水印（纯前端）
// 方案：用 canvas 把「平铺的斜向半透明文字」整页渲染为一张 PNG，再 embedPng 后
// 每页 drawImage 一次。优点：
//   · 字体走浏览器（PingFang SC / 微软雅黑 等），天然支持中文，无需捆绑 CJK 字体文件；
//   · 旋转、平铺、不透明度都在 canvas 里完成，PDF 端只是贴图，体积小、速度快。
// 注意：依赖 DOM/canvas，必须在主线程执行（workerSafe:false）。
const watermarkPdf: Tool = {
  id: 'watermark-pdf',
  title: 'PDF 水印',
  description: '为每页添加平铺斜向半透明文字水印（支持中文/英文，浏览器字体渲染）',
  accept: ['application/pdf'],
  workerSafe: false,
  fields: [
    { key: 'text', label: '水印文字', type: 'text', default: 'CONFIDENTIAL', placeholder: '如 保密 或 CONFIDENTIAL' },
    {
      key: 'opacity',
      label: '不透明度',
      type: 'select',
      default: '0.25',
      options: [
        { label: '浅 (0.15)', value: '0.15' },
        { label: '中 (0.25)', value: '0.25' },
        { label: '深 (0.4)', value: '0.4' },
      ],
    },
  ],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const text = String(options.text || 'CONFIDENTIAL');
    // 防御：选项未被正确解析为空字符串时回退 0.25，避免不透明度变 0 导致"看不见水印"
    const opacity = Number(options.opacity) || 0.25;
    const bytes = await files[0].arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages();
    const size = 46; // 水印字号（PDF 点）

    // 同一尺寸页面只渲染一次水印图，缓存复用
    const cache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const key = `${Math.round(width)}x${Math.round(height)}`;
      let img = cache.get(key);
      if (!img) {
        const png = await renderWatermarkPng(width, height, text, size);
        img = await doc.embedPng(png);
        cache.set(key, img);
      }
      page.drawImage(img, { x: 0, y: 0, width, height, opacity });
      ctx?.onProgress?.((i + 1) / pages.length, `加水印第 ${i + 1}/${pages.length} 页`);
    }
    const saved = await doc.save();
    const name = deriveName(files[0].name, 'watermarked');
    return [{ blob: new Blob([saved], { type: 'application/pdf' }), name }];
  },
};

/** 把整页平铺水印渲染为 PNG（透明底 + 灰色斜向文字），返回像素字节 */
async function renderWatermarkPng(
  width: number,
  height: number,
  text: string,
  size: number,
): Promise<Uint8Array> {
  const S = 2; // 2 倍超采样，保证文字清晰
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * S);
  canvas.height = Math.ceil(height * S);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 canvas 上下文');
  ctx.scale(S, S);
  ctx.font = `${size}px "PingFang SC","Microsoft YaHei","Heiti SC","WenQuanYi Micro Hei",sans-serif`;
  ctx.fillStyle = 'rgba(128,128,128,1)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const tw = ctx.measureText(text).width;
  const stepX = tw + Math.max(80, tw * 0.6);
  const stepY = size * 2.4;

  for (let y = -height; y < height * 2; y += stepY) {
    for (let x = -width; x < width * 2; x += stepX) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
  if (!blob) throw new Error('水印图像生成失败');
  return new Uint8Array(await blob.arrayBuffer());
}

registry.register(watermarkPdf);
export default watermarkPdf;
