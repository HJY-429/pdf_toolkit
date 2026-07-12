// 核心：将 DOM 元素栅格化为多页 PDF
// 用于：Word→PDF、Excel→PDF、HTML→PDF（M3）
// 原理：html2canvas 抓取整元素为一张长图，再智能切片为多页——切页线会
// 主动避开图片/表格边界，避免图片被腰斩（原先按固定 A4 高度硬切会切断图片）。
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

type Rect = [number, number]; // [top, bottom] 在 canvas 像素坐标系

/**
 * 收集需要"避免被切"的元素在画布中的纵向区间（图片、表格、行）。
 */
function collectAvoidRects(el: HTMLElement, canvasH: number, scale: number): Rect[] {
  const hostRect = el.getBoundingClientRect();
  const out: Rect[] = [];
  el.querySelectorAll('img, table, tr, .avoid-break').forEach((node) => {
    const r = (node as HTMLElement).getBoundingClientRect();
    const top = (r.top - hostRect.top) * scale;
    const bottom = (r.bottom - hostRect.top) * scale;
    if (bottom <= 0 || top >= canvasH) return;
    out.push([Math.max(0, top), Math.min(canvasH, bottom)]);
  });
  return out;
}

/**
 * 计算切页线（每一页在长图中的起始 y，canvas 像素坐标）。
 * 若按固定页高算出的切页线落在某个"避让区间"内，则挪到最近的边界，
 * 从而让图片/表格完整落在某一页内。
 */
function computeCuts(canvasH: number, pageHpx: number, avoids: Rect[]): number[] {
  const cuts: number[] = [0];
  let cur = 0;
  let guard = 0;
  while (cur + pageHpx < canvasH - 1 && guard++ < 10000) {
    let next = cur + pageHpx;
    for (const [top, bottom] of avoids) {
      if (next > top && next < bottom) {
        const toTop = next - top;
        const toBottom = bottom - next;
        next = toBottom <= toTop ? bottom : top;
      }
    }
    if (next <= cur) next = cur + 1; // 防止死循环
    if (next >= canvasH) break;
    cuts.push(next);
    cur = next;
  }
  return cuts;
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
  const scale = 2;
  const canvas = await html2canvas(el, {
    scale,
    backgroundColor: opts.backgroundColor ?? '#ffffff',
    logging: false,
    useCORS: true,
    windowWidth: el.scrollWidth,
  });
  opts.onProgress?.(0.7, '生成 PDF…');

  const imgData = canvas.toDataURL('image/png');
  // 按内容宽度等比缩放后的整图高度（mm）
  const imgH = (canvas.height * contentW) / canvas.width;
  // 一页对应的长图像素高度
  const pageHpx = pageH * (canvas.height / imgH);

  const avoids = collectAvoidRects(el, canvas.height, scale);
  const cuts = computeCuts(canvas.height, pageHpx, avoids);

  for (let i = 0; i < cuts.length; i++) {
    const startPx = cuts[i];
    // 该页顶部在整图中的 mm 偏移（负值上移，使 startPx 处对齐页面顶）
    const yMm = -(startPx / canvas.height) * imgH;
    pdf.addImage(imgData, 'PNG', margin, yMm, contentW, imgH);
    if (i < cuts.length - 1) pdf.addPage();
  }

  opts.onProgress?.(1, '完成');
  return pdf.output('blob');
}

/**
 * 创建一个离屏渲染宿主（用于把 HTML 字符串放进 DOM 供 html2canvas 抓取）。
 * 宽度按 A4 比例（96dpi）：纵向 794px，横向 1123px。
 * 已加图片自适应与分页保护样式，减少跨页断裂。
 */
export function createRenderHost(html: string, orientation: 'portrait' | 'landscape' = 'portrait'): HTMLElement {
  const width = orientation === 'landscape' ? 1123 : 794;
  const host = document.createElement('div');
  host.className = 'pdf-render-host';
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;min-height:1123px;background:#fff;padding:32px;box-sizing:border-box;font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.7;color:#111;`;
  // 结构样式：图片自适应、表格/图片尽量不被分页切断
  const style = document.createElement('style');
  style.textContent =
    'img{max-width:100%;height:auto;}table,tr,td,th,img,blockquote,pre{page-break-inside:avoid;break-inside:avoid;}';
  host.appendChild(style);
  host.innerHTML += html;
  document.body.appendChild(host);
  return host;
}
