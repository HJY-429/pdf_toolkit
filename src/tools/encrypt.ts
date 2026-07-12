import { PDFDocument } from '@cantoo/pdf-lib';
import type { Tool, ToolInput, ToolOutput } from '../core/types';
import { registry } from '../core/registry';
import { deriveName } from '../core/io';

// M2：PDF 加密（纯前端，@cantoo/pdf-lib 分支，支持标准安全处理器）
// 注意：原版 pdf-lib 的 save({userPassword}) 会静默忽略密码、不产生 /Encrypt 字典，
// 因此改用 @cantoo/pdf-lib 分支：先 load，再显式 encrypt({...})，最后 save()。
const encryptPdf: Tool = {
  id: 'encrypt-pdf',
  title: 'PDF 加密',
  description: '为 PDF 设置打开密码与权限密码，加密后仅持密码者可打开（标准 PDF 加密）',
  accept: ['application/pdf'],
  // 在主线程执行：加密需用到 Web Crypto，且文件通常较小，无需 Worker 分块
  workerSafe: false,
  fields: [
    { key: 'userPassword', label: '打开密码（必填）', type: 'text', placeholder: '设置打开密码' },
    { key: 'ownerPassword', label: '权限密码（可选）', type: 'text', placeholder: '留空则等同打开密码' },
  ],
  async run({ files, options }: ToolInput): Promise<ToolOutput> {
    const user = String(options.userPassword || '');
    if (!user) throw new Error('请填写打开密码');
    // 未填权限密码时，默认与打开密码相同，确保持密码者拥有完全权限
    const owner = options.ownerPassword ? String(options.ownerPassword) : user;
    const bytes = await files[0].arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    // 设置标准加密：打开需 user 密码；持有 owner 密码者拥有完全权限。
    // 默认允许打印/填表/辅助提取，禁止修改、复制、批注、文档组装。
    doc.encrypt({
      userPassword: user,
      ownerPassword: owner,
      permissions: {
        printing: 'highResolution',
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: true,
        contentAccessibility: true,
        documentAssembly: false,
      },
    });
    const saved = await doc.save();
    const name = deriveName(files[0].name, 'encrypted');
    return [{ blob: new Blob([saved], { type: 'application/pdf' }), name }];
  },
};

registry.register(encryptPdf);
export default encryptPdf;
