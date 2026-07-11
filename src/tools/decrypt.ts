import { PDFDocument } from 'pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M2：PDF 解密 / 移除密码（纯前端，pdf-lib）
// 需提供原密码才能加载，输出为无密码 PDF。
const decryptPdf: Tool = {
  id: 'decrypt-pdf',
  title: 'PDF 解密',
  description: '输入正确密码加载加密 PDF，输出为去除密码的 PDF',
  accept: ['application/pdf'],
  workerSafe: true,
  fields: [{ key: 'password', label: '原密码', type: 'text', placeholder: '输入当前打开密码' }],
  async run({ files, options }: ToolInput): Promise<ToolOutput> {
    const pwd = String(options.password || '');
    const bytes = await files[0].arrayBuffer();
    let doc;
    try {
      doc = await PDFDocument.load(bytes, { password: pwd });
    } catch {
      throw new Error('密码错误，无法打开该 PDF');
    }
    const saved = await doc.save();
    const name = deriveName(files[0].name, 'decrypted');
    return [{ blob: new Blob([saved], { type: 'application/pdf' }), name }];
  },
};

registry.register(decryptPdf);
export default decryptPdf;
