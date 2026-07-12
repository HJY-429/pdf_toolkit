import { PDFDocument, degrees } from 'pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M1：PDF 旋转（纯前端，pdf-lib）
const rotatePdf: Tool = {
  id: 'rotate-pdf',
  title: 'PDF 旋转',
  description: '将 PDF 全部页面旋转指定角度（0/90/180/270）',
  accept: ['application/pdf'],
  workerSafe: true,
  fields: [
    {
      key: 'angle',
      label: '旋转角度',
      type: 'select',
      default: 90,
      options: [
        { label: '顺时针 90°', value: 90 },
        { label: '顺时针 180°', value: 180 },
        { label: '顺时针 270°', value: 270 },
        { label: '不旋转 (0°)', value: 0 },
      ],
    },
  ],
  async run({ files, options }: ToolInput): Promise<ToolOutput> {
    const angle = Number(options.angle ?? 90);
    const bytes = await files[0].arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    doc.getPages().forEach((p) => p.setRotation(degrees(angle)));
    const name = deriveName(files[0].name, `rotated-${angle}`);
    return [{ blob: new Blob([await doc.save()], { type: 'application/pdf' }), name }];
  },
};

registry.register(rotatePdf);
export default rotatePdf;
