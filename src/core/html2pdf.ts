// 核心：将 DOM 元素栅格化为多页 PDF
// 用于：Word→PDF、Excel→PDF、HTML→PDF（M3）
// 原理：html2canvas 抓取整元素为一张长图，按 A4 高度切片为多页。
// 注意：依赖 DOM，必须在主线程执行（不放入 Web Worker）。

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface HtmlToPdfOptions {
  orientation?: 'portrait' | 'landscape';
  /** 左右页边距（mm），纵向分页按整页高度切 */
  margin?: number;
  /** 渲染时是否带背景色（默认白底，避免透明变黑） */
  backgroundColor?: string;
  onProgress?: (ratio: number, label?: string) => void;
}

/**
 * 将给定元素渲染为 PDF Blob。
 * @param el 已在文档中、具有确定宽度的元素（建议固定像素宽度以匹配 A4）。
 */
export async function htmlToPdf(el: HTMLElement, opts: HtmlToPdfOptions = {}): Promise<Blob> {
  const orientation = opts.orientation ?? 'portrait';
  const margin = opts.margin ?? 8;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;

  opts.onProgress?.(0.1, '渲染页面…');
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: opts.backgroundColor ?? '#ffffff',
    logging: false,
    useCORS: true,
    windowWidth: el.scrollWidth,
  });
  opts.onProgress?.(0.7, '生成 PDF…');

  const imgData = canvas.toDataURL('image/png');
  const imgH = (canvas.height * contentW) / canvas.width;

  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, 'PNG', margin, position, contentW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position = heightLeft - imgH; // 负值，上移以显示下一截
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, position, contentW, imgH);
    heightLeft -= pageH;
  }
  opts.onProgress?.(1, '完成');
  return pdf.output('blob');
}

/**
 * 创建一个离屏渲染宿主（用于把 HTML 字符串放进 DOM 供 html2canvas 抓取）。
 * 宽度按 A4 比例（96dpi）：纵向 794px，横向 1123px。
 */
export function createRenderHost(html: string, orientation: 'portrait' | 'landscape' = 'portrait'): HTMLElement {
  const width = orientation === 'landscape' ? 1123 : 794;
  const host = document.createElement('div');
  host.className = 'pdf-render-host';
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;min-height:1123px;background:#fff;padding:32px;box-sizing:border-box;font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.7;color:#111;`;
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}
