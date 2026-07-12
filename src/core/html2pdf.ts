// 核心：将 DOM 元素栅格化为多页 PDF
// 用于：Word→PDF、Excel→PDF、HTML→PDF（M3）
//
// 设计要点（v2，2026-07-12 重写）：
//   1) 不再把整个元素抓成「一张超长图」再切片——长文档/多工作表会生成数万像素高的
//      canvas，内存瞬间爆掉导致卡死/崩溃。改为「按 A4 内容高度逐片渲染」：
//      每一片高度≈一页，canvas 像素高度有界（≈一页×scale），内存恒定可控。
//   2) 切片边界主动避让文字块（p/li/h1-6/blockquote/pre）与图片/表格，
//      使段落、标题、图片尽量完整落在同一页，解决「分页不连贯/文字被腰斩」。
//   3) 依赖 DOM，必须在主线程执行（不放入 Web Worker）。

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface HtmlToPdfOptions {
  orientation?: 'portrait' | 'landscape';
  /** 左右/上下页边距（mm） */
  margin?: number;
  /** 渲染时是否带背景色（默认白底，避免透明变黑） */
  backgroundColor?: string;
  onProgress?: (ratio: number, label?: string) => void;
}

type Rect = [number, number]; // [top, bottom]（CSS 像素，相对元素顶）

/**
 * 收集需要「避免被切」的元素纵向区间（CSS 像素，相对元素顶）。
 * 文字块 + 图片/表格都纳入，让分页边界落在块与块之间，而非文字中间。
 */
function collectAvoidRects(el: HTMLElement): Rect[] {
  const hostRect = el.getBoundingClientRect();
  const out: Rect[] = [];
  el
    .querySelectorAll('img, table, tr, p, li, blockquote, pre, h1, h2, h3, h4, h5, h6, .avoid-break')
    .forEach((node) => {
      const r = (node as HTMLElement).getBoundingClientRect();
      const top = r.top - hostRect.top;
      const bottom = r.bottom - hostRect.top;
      if (bottom <= 0 || top >= hostRect.height) return;
      out.push([top, bottom]);
    });
  return out;
}

/**
 * 把切页线 bottom 微调到「不在任何块内部」、且最靠近原位置的地方，避免切断文字/图片。
 * 在 ±maxShift 窗口内考虑各块的上下边界作为候选；若实在无法避让（如块高于窗口），
 * 则维持原切页线（不可避免）。
 */
function adjustCut(bottom: number, avoids: Rect[], maxShift = 48): number {
  const candidates: number[] = [bottom];
  for (const [t, b] of avoids) {
    if (t >= bottom - maxShift && t <= bottom + maxShift) candidates.push(t - 2);
    if (b >= bottom - maxShift && b <= bottom + maxShift) candidates.push(b + 2);
  }
  let best = bottom;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (c < bottom - maxShift || c > bottom + maxShift) continue;
    let inside = false;
    for (const [t, b] of avoids) {
      if (c > t && c < b) {
        inside = true;
        break;
      }
    }
    if (inside) continue;
    const d = Math.abs(c - bottom);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * 将给定元素渲染为 PDF Blob。
 * 元素应已在文档中、具有确定宽度（建议固定像素宽以匹配 A4 比例）。
 */
export async function htmlToPdf(el: HTMLElement, opts: HtmlToPdfOptions = {}): Promise<Blob> {
  const orientation = opts.orientation ?? 'portrait';
  const margin = opts.margin ?? 8;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;

  const W = el.scrollWidth; // 渲染宽度（CSS px）
  const H = el.scrollHeight; // 渲染总高（CSS px）
  const mmPerPx = contentW / W; // 每 CSS 像素对应的 mm
  const pageSliceCss = contentH / mmPerPx; // 每页内容高度（CSS px）
  const scale = 2; // 每片渲染分辨率

  opts.onProgress?.(0.05, '分析页面…');
  const avoids = collectAvoidRects(el);
  const nSlices = Math.max(1, Math.ceil(H / pageSliceCss));

  for (let k = 0; k < nSlices; k++) {
    const top = k * pageSliceCss;
    let bottom = Math.min(H, top + pageSliceCss);
    bottom = adjustCut(bottom, avoids);
    bottom = Math.min(Math.max(bottom, top + 50), H); // 防止零高/负高切片
    const sliceH = bottom - top;

    opts.onProgress?.(0.1 + (k / nSlices) * 0.8, `渲染第 ${k + 1}/${nSlices} 页…`);
    const canvas = await html2canvas(el, {
      scale,
      x: 0,
      y: top,
      width: W,
      height: sliceH,
      backgroundColor: opts.backgroundColor ?? '#ffffff',
      logging: false,
      useCORS: true,
      windowWidth: W,
    });

    const imgData = canvas.toDataURL('image/png');
    // 保持宽高比：按本片 canvas 比例换算成 mm
    const sliceHmm = (canvas.height / canvas.width) * contentW;

    if (k > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, margin, contentW, sliceHmm);
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
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;background:#fff;padding:0;box-sizing:border-box;font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.7;color:#111;`;
  // 结构样式：图片自适应、表格/图片/文字块尽量不被分页切断
  const style = document.createElement('style');
  style.textContent =
    'img{max-width:100%;height:auto;}table,tr,td,th,img,blockquote,pre,li,p,h1,h2,h3,h4,h5,h6,.avoid-break{page-break-inside:avoid;break-inside:avoid;}';
  host.appendChild(style);
  // 用内层 wrapper 承载内边距，保证 host 宽度即渲染宽度（W 计算更准）
  const inner = document.createElement('div');
  inner.style.cssText = 'padding:32px;box-sizing:border-box;';
  inner.innerHTML = html;
  host.appendChild(inner);
  document.body.appendChild(host);
  return host;
}
