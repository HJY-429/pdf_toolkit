import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';
import { loadPdf } from '../core/pdfjs';

// 格式转换：PDF → Excel（文本级还原版面）
// 思路：pdf.js 逐页提取带坐标的文本项（x/y/width），按 y 聚行为"行"、
// 按 x 聚类为"列"，重建成 2D 网格写入 XLSX。能保留文本与大致阅读顺序，
// 但对复杂合并单元格/无文本层的扫描件无法完美还原（PDF 天生无表格结构）。
const pdfToExcel: Tool = {
  id: 'pdf-to-excel',
  title: 'PDF 转 Excel',
  description: '将 PDF 文本按版面坐标还原为可编辑表格（保留行列布局，复杂表格/扫描件可能不完美）',
  accept: ['application/pdf'],
  workerSafe: false,
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const bytes = await files[0].arrayBuffer();
    const XLSX = await import('xlsx');
    const doc = await loadPdf(bytes);
    const total = doc.numPages;

    type Item = { x: number; y: number; w: number; str: string };
    const all: Item[] = [];

    for (let p = 1; p <= total; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const ph = vp.height;
      const tc = await page.getTextContent();
      for (const it of tc.items as any[]) {
        if (!('str' in it) || !it.str) continue;
        const x = it.transform[4];
        const yTop = ph - it.transform[5]; // 转为自顶向下坐标，便于按行聚合
        all.push({ x, y: yTop, w: it.width || 0, str: it.str });
      }
      ctx?.onProgress?.(p / total, `解析第 ${p}/${total} 页`);
    }
    doc.destroy().catch(() => {});

    const matrix = buildMatrix(all);
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    ws['!cols'] = computeCols(matrix);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const name = deriveName(files[0].name, 'from-pdf', 'xlsx');
    return [{ blob, name }];
  },
};

/** 把坐标文本项重建成 2D 字符串矩阵 */
function buildMatrix(items: { x: number; y: number; w: number; str: string }[]): string[][] {
  if (!items.length) return [['（无可提取文本，可能为扫描件，需 OCR 支持）']];

  // 1) 按 y 聚类为"行"（同行 y 接近）
  const rowTol = 2.5;
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { x: number; w: number; str: string }[][] = [];
  let cur: { x: number; w: number; str: string }[] = [];
  let lastY = sorted[0].y;
  for (const it of sorted) {
    if (it.y - lastY > rowTol && cur.length) {
      rows.push(cur);
      cur = [];
    }
    cur.push({ x: it.x, w: it.w, str: it.str });
    lastY = it.y;
  }
  if (cur.length) rows.push(cur);

  // 2) 全局列：聚类所有文本中心 x，得到列中心
  const colTol = 6;
  const centers = [...new Set(items.map((i) => i.x + i.w / 2))].sort((a, b) => a - b);
  const cols: number[] = [];
  let groupStart = centers[0];
  let groupEnd = centers[0];
  for (let i = 1; i < centers.length; i++) {
    if (centers[i] - groupEnd <= colTol) groupEnd = centers[i];
    else {
      cols.push((groupStart + groupEnd) / 2);
      groupStart = groupEnd = centers[i];
    }
  }
  cols.push((groupStart + groupEnd) / 2);
  // 列索引查找：返回最接近的列，超出阈值则视为新列追加到末尾
  const colOf = (cx: number): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < cols.length; i++) {
      const d = Math.abs(cols[i] - cx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > colTol * 4) {
      cols.push(cx);
      return cols.length - 1;
    }
    return best;
  };

  // 3) 填充矩阵：同行同列的多个文本项用空格连接
  const grid: string[][] = [];
  for (const row of rows) {
    const cells: Record<number, string[]> = {};
    for (const it of row) {
      const c = colOf(it.x + it.w / 2);
      (cells[c] ||= []).push(it.str);
    }
    const maxCol = Math.max(...Object.keys(cells).map(Number));
    const line: string[] = [];
    for (let c = 0; c <= maxCol; c++) line.push((cells[c] || []).join(' '));
    grid.push(line);
  }
  return grid;
}

/** 依据每列最长文本估算列宽，兼顾中英文 */
function computeCols(matrix: string[][]): { wch: number }[] {
  if (!matrix.length) return [{ wch: 20 }];
  const n = Math.max(...matrix.map((r) => r.length));
  const cols: { wch: number }[] = [];
  for (let c = 0; c < n; c++) {
    let max = 8;
    for (const row of matrix) {
      const s = row[c] || '';
      // CJK 字符按 2 宽度计，其余按 1
      const w = [...s].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
      if (w > max) max = w;
    }
    cols.push({ wch: Math.min(60, max + 2) });
  }
  return cols;
}

registry.register(pdfToExcel);
export default pdfToExcel;
