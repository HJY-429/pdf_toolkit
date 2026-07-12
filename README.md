# PDF 工具箱（PDF Toolkit）

纯前端、隐私优先的在线 PDF 处理工具集。所有文件处理都在你的**浏览器内**完成，不经过任何服务器——文件不会上传，关闭页面即销毁。

🔗 线上地址：https://pdf-toolkit-hhh.pages.dev

## 功能清单（15 个，全免费、无限次）

按分类组织，首页卡片网格进入：

- **合并与拆分**
  - PDF 合并：多文件拖拽排序合并
  - PDF 拆分：每页 / 固定页数 / 自定义页码范围
  - PDF 旋转：0 / 90 / 180 / 270
- **页面编辑**
  - 图片转 PDF：多张 PNG/JPG 合为一 PDF
  - PDF 转图片：逐页渲染 PNG
  - PDF 提取文本：文本层导出 .txt
- **格式转换**
  - Word → PDF（mammoth + 栅格化）
  - Excel → PDF（SheetJS + 栅格化）
  - PDF → Word（pdf.js 文本级）
  - HTML → PDF（html2canvas 栅格化）
- **安全加密**
  - PDF 加密：打开密码 + 权限密码
  - PDF 解密：输密码去加密
- **优化压缩**
  - PDF 压缩：重绘为低清 JPEG，对扫描件有效

## 技术栈

- **Vite + TypeScript** 构建
- **pdf-lib**：合并 / 拆分 / 旋转 / 加密 / 水印 / 页码 / 图片转 PDF
- **pdf.js (pdfjs-dist)**：压缩 / 转图片 / 提取文本
- **mammoth / SheetJS(xlsx) / docx / html2canvas / jsPDF**：Office ↔ PDF
- **Cloudflare Pages**：零后端静态托管

## 本地开发

```bash
cd dev
npm install
npm run dev        # 开发模式，打开提示的 localhost 地址
npm run build      # 构建到 dist/
npm run preview    # 预览生产构建
```

## 部署

见 [README_部署.md](./README_部署.md)。线上 https://pdf-toolkit-hhh.pages.dev 由 Cloudflare Pages + GitHub 自动部署（`git push` 即更新）。

## 架构：ToolRegistry 可扩展模式

每个功能是一个 `Tool`（`id/title/description/accept/multiple/workerSafe/fields/run`），`import` 进 `src/tools/index.ts` 即自动注册到全局注册表；UI 只依赖注册表，新增功能 = 新增一个 Tool 文件 + 一行注册，不动核心代码。详见 [PDF处理网站开发文档.md](./PDF处理网站开发文档.md)（含分阶段里程碑 M1–M6 与实现进度）。

## 已知限制

- 水印 / 页码中文需嵌入 CJK 字体（当前仅英文 / 数字）。
- 压缩对矢量 PDF 可能变大（本质栅格化）。
- PDF → 文本对扫描件为空（需 OCR）。
- Word / Excel → PDF 为栅格化（文本不可选）；PDF → Word 为文本级（无排版 / 图片）。
- HTML → PDF 无法加载外部 CSS / 图片。
