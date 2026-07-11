import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M3：Word(.docx) → PDF
// 思路：mammoth 将 docx 转为带有基础排版的 HTML，再通过 html2pdf 栅格化为 PDF。
// 说明：保留标题/段落/表格等结构文本；嵌入式图片依赖 mammoth 默认处理（可能缺失，MVP 可接受）。
const wordToPdf: Tool = {
  id: 'word-to-pdf',
  title: 'Word 转 PDF',
  description: '将 .docx 文档转换为 PDF（保留标题、段落、表格等文本结构，图片可能不完整）',
  accept: ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  fields: [
    {
      key: 'orientation',
      label: '方向',
      type: 'select',
      options: [
        { label: '纵向', value: 'portrait' },
        { label: '横向', value: 'landscape' },
      ],
      default: 'portrait',
    },
  ],
  async run({ files, options }: ToolInput, ctx): Promise<ToolOutput> {
    const orientation = (options.orientation as 'portrait' | 'landscape') || 'portrait';
    // 动态加载重型依赖：仅在真正运行时才拉取，优化首屏
    const { htmlToPdf, createRenderHost } = await import('../core/html2pdf');
    const mammoth = (await import('mammoth')).default;
    const arrayBuffer = await files[0].arrayBuffer();
    ctx?.onProgress?.(0.2, '解析 Word…');
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
    const host = createRenderHost(html, orientation);
    try {
      const blob = await htmlToPdf(host, {
        orientation,
        onProgress: (r, label) => ctx?.onProgress?.(0.2 + r * 0.8, label),
      });
      const name = deriveName(files[0].name, 'from-word', 'pdf');
      return [{ blob, name }];
    } finally {
      host.remove();
    }
  },
};

registry.register(wordToPdf);
export default wordToPdf;
