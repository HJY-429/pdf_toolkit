import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M3：Excel(.xlsx/.xls) → PDF
// 思路：SheetJS 解析工作簿 → 逐工作表重建 HTML 表格，关键改进在于
//   · 按"内容宽度 + 原表列宽(!cols)"计算每列像素宽，写入 <colgroup>，配合
//     table-layout:fixed，使列宽稳定、比例合理，彻底解决"列被拉伸/缩窄"；
//   · 表头加底色加粗、隔行底纹、单元格内边距、长文本自动换行，提升美观度；
//   · 用 rowspan/colspan 还原合并单元格。
// 仍走 html2canvas 栅格化（html2pdf），以保留中文等非拉丁字符（jsPDF 默认字体不支持 CJK）。
const excelToPdf: Tool = {
  id: 'excel-to-pdf',
  title: 'Excel 转 PDF',
  description: '将 .xlsx/.xls 工作簿转为 PDF：每个工作表一页，列宽按内容自适应、保留合并单元格与中文，美观易读',
  accept: ['.xlsx', '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  fields: [
    {
      key: 'orientation',
      label: '页面方向',
      type: 'select',
      options: [
        { label: '横向（适合宽表）', value: 'landscape' },
        { label: '纵向', value: 'portrait' },
      ],
      default: 'landscape',
    },
    { key: 'zebra', label: '隔行底纹', type: 'checkbox', default: true },
  ],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const orientation = (options.orientation as 'portrait' | 'landscape') || 'landscape';
    const zebra = options.zebra !== false;
    const { htmlToPdf, createRenderHost } = await import('../core/html2pdf');
    const XLSX = await import('xlsx');
    const buf = await files[0].arrayBuffer();
    ctx?.onProgress?.(0.2, '解析 Excel…');
    const wb = XLSX.read(buf, { type: 'array' });

    // 渲染宿主（离屏）内容宽度（A4 比例 px 减去左右内边距）
    const hostW = orientation === 'landscape' ? 1123 : 794;
    const budget = hostW - 64;

    const style = `
      .sheet-title{font-size:18px;font-weight:700;margin:6px 0 10px;color:#1a1a1a;}
      table.xls{border-collapse:collapse;width:100%;table-layout:fixed;font-size:11px;color:#222;
        font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;}
      table.xls th,table.xls td{border:1px solid #b8b8b8;padding:5px 7px;vertical-align:top;
        word-break:break-word;overflow-wrap:anywhere;}
      table.xls tr:first-child td,table.xls thead td{background:#2f6fed;color:#fff;font-weight:700;text-align:left;}
      table.xls tbody tr:nth-child(even) td{background:#f4f7fe;}
      table.xls.no-zebra tbody tr:nth-child(even) td{background:transparent;}
    `;

    let html = `<style>${style}</style>`;
    let sheets = 0;
    wb.SheetNames.forEach((name) => {
      const ws = wb.Sheets[name];
      // raw:false → 日期/数值按单元格格式转成字符串；defval 保证空单元格不丢列
      const aoa = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
        defval: '',
      }) as (string | number)[][];
      if (!aoa.length) return;
      const merges = (ws['!merges'] || []) as { s: { r: number; c: number }; e: { r: number; c: number } }[];
      const colsInfo = (ws['!cols'] || []) as { wch?: number }[];
      html += buildSheetHtml(name, aoa, merges, colsInfo, budget, zebra);
      sheets++;
    });

    if (sheets === 0) throw new Error('工作簿中没有可读取的数据');

    const host = createRenderHost(html, orientation);
    try {
      const blob = await htmlToPdf(host, {
        orientation,
        onProgress: (r, label) => ctx?.onProgress?.(0.2 + r * 0.8, label),
      });
      const name = deriveName(files[0].name, 'from-excel', 'pdf');
      return [{ blob, name }];
    } finally {
      host.remove();
    }
  },
};

/** 统计单元格"字符宽度"：CJK 按 2 计，其余按 1，用于列宽估算 */
function charWidth(text: unknown): number {
  const s = String(text ?? '');
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return w;
}

/** 把一个工作表渲染成带 colgroup 的 HTML 表格（含合并单元格） */
function buildSheetHtml(
  name: string,
  aoa: (string | number)[][],
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[],
  colsInfo: { wch?: number }[],
  budget: number,
  zebra: boolean,
): string {
  const nCols = Math.max(...aoa.map((r) => r.length), 1);

  // 1) 每列"自然宽度"（字符）：优先用原表列宽 !cols.wch，否则按内容最大值
  const nat: number[] = [];
  for (let c = 0; c < nCols; c++) {
    let max = colsInfo[c]?.wch ?? 8;
    for (const row of aoa) {
      const w = charWidth(row[c]);
      if (w > max) max = w;
    }
    nat[c] = Math.min(max, 60); // 上限，避免超长内容独占整页
  }

  // 2) 归一化到预算宽度（px），并兜底最小 8px，避免极窄列
  const sum = nat.reduce((a, b) => a + b, 0) || 1;
  let widths = nat.map((w) => (w / sum) * budget);
  let deficit = 0;
  widths = widths.map((w) => {
    if (w < 8) {
      deficit += 8 - w;
      return 8;
    }
    return w;
  });
  const bigSum = widths.reduce((a, w) => a + (w > 8 ? w - 8 : 0), 0);
  if (bigSum > 0 && deficit > 0) {
    widths = widths.map((w) => (w > 8 ? 8 + (w - 8) * (1 - Math.min(1, deficit / bigSum)) : w));
  }
  const colgroup = `<colgroup>${widths
    .map((w) => `<col style="width:${Math.round(w)}px">`)
    .join('')}</colgroup>`;

  // 3) 合并单元格：标记被覆盖的格子，记录左上角格子的跨行/跨列
  const covered = new Set<string>();
  const mergeAt = new Map<string, { rs: number; cs: number }>();
  for (const m of merges) {
    mergeAt.set(`${m.s.r},${m.s.c}`, { rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 });
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        covered.add(`${r},${c}`);
      }
  }

  // 4) 逐行逐列生成 <td>（跳过被覆盖的格子）
  let rows = '';
  aoa.forEach((row, r) => {
    let cells = '';
    for (let c = 0; c < nCols; c++) {
      const key = `${r},${c}`;
      if (covered.has(key)) continue;
      const m = mergeAt.get(key);
      const rs = m?.rs || 1;
      const cs = m?.cs || 1;
      const val = escapeHtml(String(row[c] ?? ''));
      cells += `<td rowspan="${rs}" colspan="${cs}">${val}</td>`;
    }
    rows += `<tr>${cells}</tr>`;
  });

  return `<div class="sheet-title">${escapeHtml(name)}</div><table class="xls${
    zebra ? '' : ' no-zebra'
  }">${colgroup}${rows}</table>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c),
  );
}

registry.register(excelToPdf);
export default excelToPdf;
