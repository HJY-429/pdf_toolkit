import { PDFDocument } from 'pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M2：PDF 加密（纯前端，pdf-lib）
// 设置打开密码（userPassword）与权限密码（ownerPassword）。
const encryptPdf: Tool = {
  id: 'encrypt-pdf',
  title: 'PDF 加密',
  description: '为 PDF 设置打开密码（与可选权限密码），加密后仅持密码者可打开',
  accept: ['application/pdf'],
  workerSafe: true,
  fields: [
    { key: 'userPassword', label: '打开密码（必填）', type: 'text', placeholder: '设置打开密码' },
    { key: 'ownerPassword', label: '权限密码（可选）', type: 'text', placeholder: '留空则等同打开密码' },
  ],
  async run({ files, options }: ToolInput): Promise<ToolOutput> {
    const user = String(options.userPassword || '');
    if (!user) throw new Error('请填写打开密码');
    const owner = String(options.ownerPassword || '') || undefined;
    const bytes = await files[0].arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    const saved = await doc.save({ userPassword: user, ownerPassword: owner });
    const name = deriveName(files[0].name, 'encrypted');
    return [{ blob: new Blob([saved], { type: 'application/pdf' }), name }];
  },
};

registry.register(encryptPdf);
export default encryptPdf;
