// 核心：PDF.js 封装
// 用于：压缩（重绘低清页面）、PDF 转图片、PDF 提取文本
// 注意：pdfjs-dist v4 为 ESM，Worker 需通过 Vite 的 ?url 引入。

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - Vite 提供的 url 引入
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// 用模块地址解析 worker URL：无论部署在根路径还是子路径，都能正确找到 worker 文件
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(workerUrl, import.meta.url).href;

export interface PdfPageImage {
  pageNumber: number;
  canvas: HTMLCanvasElement;
}

/** 加载 PDF 文档（返回 pdfjs 文档代理） */
export async function loadPdf(data: ArrayBuffer) {
  // 复制一份，pdfjs 会接管 buffer，避免被 transfer 后原 buffer 失效
  const buf = data.slice(0);
  return pdfjsLib.getDocument({ data: buf }).promise;
}

/** 将指定页渲染到 canvas */
export async function renderPage(
  doc: Awaited<ReturnType<typeof loadPdf>>,
  pageNumber: number,
  scale = 1.5,
): Promise<PdfPageImage> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { pageNumber, canvas };
}

/** 提取全部页面文本 */
export async function extractText(
  doc: Awaited<ReturnType<typeof loadPdf>>,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const total = doc.numPages;
  let out = '';
  for (let i = 1; i <= total; i++) {
    out += (await extractPageText(doc, i)) + '\n';
    onProgress?.(i / total);
  }
  return out.trim();
}

/** 提取单页文本（用于 PDF→Word 等需要按页组织的场景） */
export async function extractPageText(
  doc: Awaited<ReturnType<typeof loadPdf>>,
  pageNumber: number,
): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  // 按行聚合：相邻 item 的 transform[5]（y）相同视为同一行
  const lines: { y: number; text: string }[] = [];
  for (const it of content.items as any[]) {
    if (!('str' in it) || !it.str) continue;
    const y = Math.round(it.transform[5]);
    const last = lines[lines.length - 1];
    if (last && last.y === y) last.text += it.str;
    else lines.push({ y, text: it.str });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) => l.text)
    .join('\n');
}
