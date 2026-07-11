import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M3：HTML → PDF（栅格化）
// 思路：读取 .html 文件文本，放进离屏宿主，html2canvas 栅格化为 PDF。
// 说明：自包含（内联样式）的 HTML 效果最佳；依赖外部 CSS/图片的页面无法加载，可能缺样式（MVP 可接受）。
const htmlToPdfTool: Tool = {
  id: 'html-to-pdf',
  title: 'HTML 转 PDF',
  description: '将 .html 文件栅格化为 PDF（适合内联样式的自包含页面；外部资源可能加载不全）',
  accept: ['.html', '.htm', 'text/html'],
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
    const { htmlToPdf, createRenderHost } = await import('../core/html2pdf');
    const raw = await files[0].text();
    const host = createRenderHost(raw, orientation);
    try {
      const blob = await htmlToPdf(host, {
        orientation,
        onProgress: (r, label) => ctx?.onProgress?.(r, label),
      });
      const name = deriveName(files[0].name, 'from-html', 'pdf');
      return [{ blob, name }];
    } finally {
      host.remove();
    }
  },
};

registry.register(htmlToPdfTool);
export default htmlToPdfTool;
