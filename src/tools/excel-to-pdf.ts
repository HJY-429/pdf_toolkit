import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M3：Excel(.xlsx/.xls) → PDF
// 思路：SheetJS 读取工作簿，每个工作表转成 HTML 表格，再统一栅格化为一份 PDF（横向更适合宽表）。
// 说明：数值/文本/基础表格结构可保留；单元格样式（颜色/字体）可能丢失（MVP 可接受）。
const excelToPdf: Tool = {
  id: 'excel-to-pdf',
  title: 'Excel 转 PDF',
  description: '将 .xlsx/.xls 工作簿转换为 PDF（每个工作表一页，保留数据表格，样式可能简化）',
  accept: ['.xlsx', '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  fields: [
    {
      key: 'orientation',
      label: '方向',
      type: 'select',
      options: [
        { label: '横向（适合宽表）', value: 'landscape' },
        { label: '纵向', value: 'portrait' },
      ],
      default: 'landscape',
    },
  ],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const orientation = (options.orientation as 'portrait' | 'landscape') || 'landscape';
    const { htmlToPdf, createRenderHost } = await import('../core/html2pdf');
    const XLSX = await import('xlsx');
    const buf = await files[0].arrayBuffer();
    ctx?.onProgress?.(0.2, '解析 Excel…');
    const wb = XLSX.read(buf, { type: 'array' });

    let html = '<style>table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #999;padding:4px 8px}th{background:#f0f0f0}.sheet-title{font-size:16px;font-weight:700;margin:18px 0 8px}</style>';
    wb.SheetNames.forEach((name) => {
      const ws = wb.Sheets[name];
      const table = XLSX.utils.sheet_to_html(ws, { id: undefined, header: '' });
      html += `<div class="sheet-title">${escapeHtml(name)}</div>${table}`;
    });

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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
}

registry.register(excelToPdf);
export default excelToPdf;
