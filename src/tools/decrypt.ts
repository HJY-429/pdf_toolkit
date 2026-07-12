import { PDFDocument } from '@cantoo/pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M2：PDF 解密 / 移除密码（纯前端，@cantoo/pdf-lib）
// 原版 pdf-lib 不实现加解密，必须用 @cantoo 分支。
// 支持一次填写多个密码（逗号/空格/换行分隔）：多文件且各文件密码不同时，
// 系统会对每个文件依次尝试所有密码，命中即解。
const decryptPdf: Tool = {
  id: 'decrypt-pdf',
  title: 'PDF 解密',
  description: '输入正确密码加载加密 PDF，输出为去除密码的 PDF（支持多个密码依次尝试）',
  accept: ['application/pdf'],
  workerSafe: true,
  fields: [
    {
      key: 'password',
      label: '原密码（多个可用逗号 / 空格 / 换行分隔）',
      type: 'text',
      placeholder: '输入当前打开密码，或依次尝试的多个密码',
    },
  ],
  async run({ files, options }: ToolInput): Promise<ToolOutput> {
    const pwds = String(options.password || '')
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!pwds.length) throw new Error('请填写密码');

    const bytes = await files[0].arrayBuffer();

    // 依次尝试每个密码，命中即解锁
    let src: PDFDocument | null = null;
    for (const p of pwds) {
      try {
        src = await PDFDocument.load(bytes, { password: p });
        break;
      } catch {
        /* 尝试下一个密码 */
      }
    }
    if (!src) throw new Error('密码错误，无法打开该 PDF');

    // 将已解锁的页面复制到全新文档，确保输出不再携带密码
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((pg) => out.addPage(pg));
    const saved = await out.save();
    const name = deriveName(files[0].name, 'decrypted');
    return [{ blob: new Blob([saved], { type: 'application/pdf' }), name }];
  },
};

registry.register(decryptPdf);
export default decryptPdf;
