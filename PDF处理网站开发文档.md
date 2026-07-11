# PDF 处理网站 · 开发文档

> 版本：v1.0 · 生成日期：2026-07-11
> 目标：构建一个基于 **Cloudflare** 部署的 PDF 在线处理网站，支持 PDF↔Word/Excel 转换、多 PDF 合并、文档转 PDF，并具备可扩展的工具接入能力。
> 配套代码骨架位于本仓库 `./dev` 目录。

---

## 0. 文档说明与阅读指引

本文档按以下顺序展开，对应开发前需要完成的四个阶段：

1. **调研**（第 1–2 章）：主流平台支持什么、纯前端技术能做到什么。
2. **分析**（第 3 章）：实用性与可开发性评估，得出技术路线结论。
3. **设计**（第 4–6 章）：总体架构、各功能模块的设计思路与实现步骤、可扩展机制。
4. **落地**（第 7–9 章）：Cloudflare 部署方案、里程碑、风险对策。

代码骨架（`./dev` 下的核心 `ToolRegistry` 与"合并"示例工具）已在第 6 章的设计落地，可直接作为后续开发的起点。

---

## 1. 调研：主流平台 PDF 能力盘点

### 1.1 被调研平台

| 平台 | 定位 | 免费策略 |
|------|------|----------|
| **iLovePDF** | 综合老牌（25+ 工具） | 基础功能免登录；有软性频次限制 |
| **Smallpdf** | 体验最佳（30+ 工具） | 每天 2 次免费任务；Pro 订阅 |
| **Adobe Acrobat Online** | 品牌背书、保真度最高 | 需 Adobe ID；部分高级功能仅 Pro |
| **PDF24 Tools** | 德国老牌，**真正全免费无限制** | 全功能免费、无需账号 |
| **Sejda** | 功能最全之一（47+ 工具） | 每小时 3 次、单文件 50 页限制 |
| **ConvertKr**（参考） | 隐私优先、纯前端 | 无限免费、文件不上传 |

### 1.2 主流能力矩阵

| 能力 | iLovePDF | Smallpdf | Adobe | PDF24 | Sejda |
|------|:---:|:---:|:---:|:---:|:---:|
| 合并 PDF | ✅ | ✅ | ✅ | ✅ | ✅ |
| 拆分 / 提取页 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 旋转 / 重排页 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 压缩 | ✅ | ✅ | ✅ | ✅ | ✅ |
| PDF → Word | ✅ | ✅ | ✅ | ✅ | ✅ |
| PDF → Excel | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| PDF → PPT / 图片 / 文本 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Word/Excel/PPT/图片 → PDF | ✅ | ✅ | ✅ | ✅ | ✅ |
| 加密 / 解密 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 水印 / 页码 | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| 编辑（文本/图片） | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| 签名 / 填写表单 | ✅ | ✅ | ✅ | ✅ | ✅ |
| OCR（扫描件识别） | ⚠️ | ✅ | ✅ | ⚠️ | ✅ |
| 对比 / 批注 / 脱敏 | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ |
| HTML → PDF | ❌ | ❌ | ❌ | ❌ | ❌ |

> 注：✅ 表示提供；⚠️ 表示仅部分/付费；❌ 表示未提供。

### 1.3 关键观察

1. **核心能力高度同质化**：合并、拆分、压缩、格式互转是所有平台的"标配"，说明这些是用户最高频、最基础的需求。
2. **免费层普遍设限**：除 PDF24、ConvertKr 外，多数平台通过每日/每小时次数、文件大小、账号门槛来引导付费。
3. **复杂格式转换依赖服务端引擎**：Word/Excel/PPT ↔ PDF 的高保真转换，主流平台几乎都走**服务端 Office 渲染引擎**（iLovePDF、Adobe 明确为云端处理）。纯前端方案在保真度上存在天然天花板。
4. **隐私成为新卖点**：ConvertKr、PDF24 把"文件不上传/本地处理"作为差异化卖点，证明**客户端处理**是一条有竞争力的路线。
5. **HTML → PDF 普遍缺失**：几乎所有平台都不提供"网页/HTML 转 PDF"，这是一个可切入的空白点（可由前端 `window.print()` 或服务端无头浏览器补足）。

### 1.4 我们的差异化机会

- **隐私优先**：文件全程在浏览器内处理，不上传服务器（对标 ConvertKr、PDF24）。在 Cloudflare Pages 静态托管下，天然可实现"零服务端文件留存"。
- **免费无限制**：纯前端计算无服务器成本，可做到真正无限次。
- **可扩展架构**：用统一的 `Tool` 接口让新功能即插即用，快速追上竞品工具数量。

---

## 2. 技术调研：纯前端可实现的边界

### 2.1 关键 JS 库对比

| 库 | 职责 | 运行环境 | 说明 |
|----|------|----------|------|
| **pdf-lib** | 写/改 PDF（合并、拆分、旋转、水印、加密、页码） | 浏览器 + Node | 纯 JS、无原生依赖，是客户端 PDF 编辑核心 |
| **pdf.js (pdfjs-dist)** | 读/渲染 PDF（预览、提取文本、转图片） | 浏览器 + Node(需 polyfill) | Mozilla 出品，负责"看"与"读" |
| **jsPDF / pdfmake** | 从零生成 PDF（HTML/数据 → PDF） | 浏览器 + Node | 适合"数据/模板 → PDF" |
| **mammoth** | `.docx` → HTML（保留基础样式） | 浏览器 + Node | Word 导入的常用方案 |
| **docx** | 程序化生成 `.docx` | 浏览器 + Node | 用于"文本/结构 → Word" |
| **SheetJS (xlsx)** | 读写 Excel/CSV | 浏览器 + Node | 表格数据导出核心 |
| **pdf2json** | PDF → 结构化 JSON（坐标/字体） | 仅 Node | 服务端结构化分析用 |
| **tesseract.js** | 前端 OCR（扫描件 → 文本） | 浏览器 + Node | WASM，可扩展 OCR 能力 |
| **html2canvas + jsPDF** | DOM → 图片 → PDF（栅格化） | 浏览器 | "网页/HTML → PDF"的轻量前端方案 |

> 核心认知（来自 pdf-lib vs pdf.js 官方对比）：**pdf-lib 负责"写"，pdf.js 负责"读"，二者互补，大多数真实应用两者都要用**。

### 2.2 能力边界（纯前端 vs 需服务端）

| 功能 | 纯前端可行性 | 推荐方案 | 保真度 |
|------|:---:|----------|:---:|
| 合并 / 拆分 / 旋转 / 重排 | ✅ 完全可行 | pdf-lib | 高 |
| 压缩（重压缩图片/对象） | ✅ 基本可行 | pdf-lib + 图片重编码 | 中 |
| 加密 / 解密 | ✅ 可行 | pdf-lib（AES） | 高 |
| 水印 / 页码 | ✅ 可行 | pdf-lib 绘制 | 高 |
| 提取文本 / 转图片 | ✅ 可行 | pdf.js | 高 |
| 图片 / 文本 → PDF | ✅ 可行 | jsPDF / pdf-lib | 高 |
| Word/Excel/PPT → PDF | ⚠️ 部分可行 | mammoth→HTML→PDF（丢失复杂排版）；高保真需服务端 | 中~低 |
| PDF → Word | ⚠️ 文本级可行 | pdf.js 提取文本 + docx 生成（丢版式）；高保真需服务端 | 低~中 |
| PDF → Excel（表格） | ⚠️ 困难 | 需表格检测/服务端引擎 | 低 |
| HTML 网页 → PDF | ⚠️ 栅格化可行 | html2canvas+jsPDF（变图片）；矢量高保真需服务端无头浏览器 | 中 |
| OCR 扫描识别 | ✅ 可行（重） | tesseract.js（WASM） | 中 |

---

## 3. 实用性与可开发性分析

### 3.1 评估维度

- **隐私**：是否在浏览器内完成、文件是否离端。
- **成本**：Cloudflare 下的计算/流量成本（纯前端≈0）。
- **保真度**：输出质量是否满足用户预期。
- **开发难度**：库成熟度、社区资料、调试成本。
- **Cloudflare 契合度**：能否跑在 Pages（静态）/ Workers（轻量 API）。

### 3.2 各功能评分（5 分制）

| 功能 | 隐私 | 成本 | 保真度 | 开发难度(易) | 契合度 | 结论 |
|------|:---:|:---:|:---:|:---:|:---:|------|
| PDF 合并 | 5 | 5 | 5 | 5 | 5 | **优先做（纯前端）** |
| 拆分/旋转/重排 | 5 | 5 | 5 | 5 | 5 | **优先做** |
| 压缩 | 5 | 5 | 4 | 4 | 5 | **优先做** |
| 加密/解密 | 5 | 5 | 5 | 4 | 5 | **优先做** |
| 水印/页码 | 5 | 5 | 5 | 4 | 5 | **优先做** |
| 图片/文本→PDF | 5 | 5 | 5 | 4 | 5 | **优先做** |
| PDF→图片/文本 | 5 | 5 | 5 | 4 | 5 | **优先做** |
| Word→PDF | 3 | 5 | 3 | 3 | 5 | 先做基础版（栅格/文本） |
| PDF→Word | 3 | 5 | 2 | 2 | 5 | 先做文本级，高保真走服务端 |
| Excel→PDF | 3 | 5 | 3 | 3 | 5 | 表格类可做 |
| PDF→Excel | 2 | 5 | 2 | 1 | 5 | 困难，标记服务端/后期 |
| HTML→PDF | 3 | 5 | 3 | 3 | 4 | 栅格化先做，矢量后期 |
| OCR | 4 | 4 | 3 | 2 | 4 | 可扩展（WASM） |

### 3.3 结论：分阶段技术路线

- **第一阶段（纯前端核心集）**：合并、拆分/旋转/重排、压缩、加密解密、水印页码、图片/文本↔PDF、PDF→图片/文本。全部跑在浏览器，Cloudflare Pages 静态托管，**零服务器成本、隐私最佳**。
- **第二阶段（扩展集，仍前端）**：Word/Excel/PPT→PDF 基础版、PDF→Word 文本级、HTML→PDF 栅格化、OCR。保真度有限但可用。
- **第三阶段（可选高保真，服务端）**：对 PDF↔Office 高保真、PDF→Excel 表格、矢量 HTML→PDF，通过 **Cloudflare Worker + 转换 API**（如 Aspose / PDF.co / Adobe PDF Services）或 **Cloudflare Containers（Beta）运行 LibreOffice** 补足。保持"默认前端、高保真可选"的产品形态。

---

## 4. 总体架构设计（Cloudflare）

### 4.1 部署拓扑

```
┌─────────────────────────────────────────────┐
│  用户浏览器（所有 PDF 操作在此完成）           │
│  Vue/原生 SPA + pdf-lib / pdf.js / ...        │
│  文件不离开浏览器 → 直接下载结果               │
└───────────────────┬─────────────────────────┘
                    │ 仅"高保真转换"等可选场景才上行
                    ▼
┌─────────────────────────────────────────────┐
│  Cloudflare Pages  │  静态站点（前端 build 产物）│
├─────────────────────────────────────────────┤
│  Cloudflare Workers │  可选：高保真转换 API 代理  │
│  Cloudflare R2     │  可选：临时文件/结果缓存     │
│  Cloudflare D1/KV  │  可选：用量统计/配置         │
└─────────────────────────────────────────────┘
```

### 4.2 前端核心架构：ToolRegistry 可扩展模式

所有功能抽象为统一的 `Tool` 对象，注册到全局注册表。UI 只关心"列出工具 → 用户选择 → 调用 `run()`"。新增功能 = 新增一个 `Tool` 实现 + 一行注册，**不动核心代码**。

```ts
// 核心接口（详见 ./dev/src/core/types.ts）
interface Tool<I = unknown, O = unknown> {
  id: string;
  title: string;
  description: string;
  accept: string[];        // 接受的文件类型，如 ['application/pdf']
  run(input: I): Promise<O>; // 纯前端处理，返回 Blob/下载
}
```

### 4.3 文件流与隐私

- **默认路径**：`用户文件 → 浏览器内存(File/Blob/ArrayBuffer) → pdf-lib/pdf.js 处理 → 浏览器下载`。全程无网络上传。
- **可选路径（高保真）**：仅当用户主动选择"高保真模式"时，才将文件经 Worker 转发给转换服务；结果回传后浏览器下载，服务端不长期留存（R2 设短 TTL）。

### 4.4 安全与隐私要点

- 不收集文件内容；不要求登录即可使用全部基础功能。
- 大文件处理放在 Web Worker，避免阻塞 UI；可配合 `CompressionStream`、WASM 线程优化。
- 前端依赖通过 CDN/打包，固定版本，启用 SRI（如需）。
- Cloudflare 层面开启 HTTPS、WAF 基础规则、速率限制（针对可选的 Worker API）。

---

## 5. 功能模块设计

> 每个模块给出：**设计思路 → 技术选型 → 输入/输出 → 实现步骤 → 难点**。

### 5.1 多 PDF 合并

- **思路**：逐个 `PDFDocument.load` 源文件，用 `copyPages` 把页面复制进目标文档，按用户拖拽顺序 `addPage`，最后 `save()`。
- **选型**：pdf-lib（核心）、pdf.js（可选：生成每页缩略图供排序预览）。
- **输入输出**：输入多个 PDF（可混合带密码 PDF，需先解密）；输出单个 PDF。
- **步骤**：
  1. 用户拖入多个文件，前端列出并支持拖拽排序、选择页面范围。
  2. 逐个 `load`，对每页 `copyPages` 后 `addPage`。
  3. 可选：生成书签/目录、给每篇来源加页脚文件名（参考 Sejda）。
  4. `save()` → Blob → 下载。
- **难点**：共享资源（字体/图片）引用需正确复制；超大文件内存占用——用流式/分块 + Worker。

### 5.2 拆分 / 提取 / 重排 / 旋转

- **思路**：基于页面索引操作。`split` 按范围生成多个文档；`extract` 只保留选中页；`reorder` 改变 `addPage` 顺序；`rotate` 设置页 `setRotation`。
- **选型**：pdf-lib。
- **步骤**：加载 → 用户勾选/拖拽页面（pdf.js 缩略图预览）→ 按操作重组 → 保存。
- **难点**：旋转角度叠加、重排后书签/链接保持。

### 5.3 压缩

- **思路**：降低嵌入图片分辨率/质量（pngquant 类 WASM 或 canvas 重编码）、移除冗余对象、可选线性化。
- **选型**：pdf-lib + canvas 图片重编码；或更简单：用 `pdf.js` 渲染页面再以较低 DPI 重绘进新 PDF（有损但体积小）。
- **难点**：有损压缩与清晰度权衡；纯前端"无损压缩"能力有限，需向用户说明。

### 5.4 加密 / 解密 / 水印 / 页码

- **加密**：pdf-lib `encrypt({ userPassword, ownerPassword, permissions })`（AES）。
- **解密**：`PDFDocument.load(bytes, { password })`。
- **水印**：逐页 `drawText/drawImage`（平铺或居中）。
- **页码**：逐页 `drawText` 指定位置。
- **难点**：权限位（禁止打印/复制）在纯前端可被绕过，仅作"软限制"，需向用户说明。

### 5.5 图片 / 文本 → PDF

- **图片→PDF**：逐张 `embedPng/Jpg` 成一页 → 保存（pdf-lib / jsPDF）。
- **文本→PDF**：jsPDF/pdfmake 直接排版生成（适合"打字生成 PDF"）。
- **难点**：多图尺寸自适应、DPI 控制。

### 5.6 Word / Excel / PPT → PDF（基础版）

- **Word→PDF**：`mammoth.extractRawText/convertToHtml` 取内容 → 用 jsPDF/html2pdf 或 pdfmake 排版成 PDF。**保真度中低**（丢失复杂版式/图片布局）。
- **Excel→PDF**：SheetJS 读表 → 渲染为 HTML 表格 → 转 PDF；或按行用 jsPDF 画表。
- **PPT→PDF**：无成熟纯前端方案，建议：① 先不做，或 ② 用 pdf.js 反向不可行；高保真走服务端。
- **高保真（第三阶段）**：Worker 调 LibreOffice（Containers）或商业 API。

### 5.7 PDF → Word / Excel（文本/结构级）

- **PDF→Word**：pdf.js `getTextContent()` 提取文本与坐标 → 用 `docx` 生成 `.docx`（按坐标近似排版）。**保真度低**（无图片/复杂表格还原）。
- **PDF→Excel**：需表格检测（识别文本块为表格），难度高，纯前端易失真；建议标记为"后期/服务端"。
- **定位**：作为"快速提取文字/表格到可编辑格式"的实用工具，而非版式还原。

### 5.8 其他可扩展功能（接入示例）

- **PDF → 图片（JPG/PNG）**：pdf.js 渲染每页到 canvas → `toBlob` → 打包下载。
- **HTML 网页 → PDF**：① 前端 `window.print()` + `@media print` 让用户"打印成 PDF"（最简单）；② `html2canvas` 栅格化 + jsPDF（适合固定布局）。
- **OCR**：tesseract.js 加载 WASM 模型，对扫描页识别文本并嵌回 PDF。
- **签名 / 填写表单**：pdf-lib 填 AcroForm；手写签名用 canvas 采集后 `embedPng`。
- **对比 / 脱敏 / 批注**：可作为后续 `Tool` 插件依次补齐。

---

## 6. 可扩展机制设计（核心）

统一的 `Tool` 接口 + 注册表是"可扩展"的关键。新增一个功能只需：

1. 在 `./dev/src/tools/` 下新建一个文件，实现 `Tool` 接口。
2. 在 `./dev/src/tools/index.ts` 中用 `registry.register(tool)` 注册一行。
3. UI 自动出现该工具入口，无需改动核心。

**示例：新增"PDF 旋转"工具（伪代码）**

```ts
import type { Tool } from '../core/types';
import { registry } from '../core/registry';
import { PDFDocument } from 'pdf-lib';

const rotatePdf: Tool<{ file: File; angle: number }, Blob> = {
  id: 'rotate-pdf',
  title: 'PDF 旋转',
  description: '将 PDF 全部页面旋转指定角度',
  accept: ['application/pdf'],
  async run({ file, angle }) {
    const bytes = await file.arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    doc.getPages().forEach((p) => p.setRotation(angle));
    return new Blob([await doc.save()], { type: 'application/pdf' });
  },
};
registry.register(rotatePdf);
```

仓库 `./dev` 中已落地：`core/types.ts`、`core/registry.ts`、`tools/merge.ts`（真实可用）、`tools/rotate.ts`、`tools/index.ts`，可作为起点。

---

## 7. 部署方案（Cloudflare）

### 7.1 目录与构建

```
./dev/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── wrangler.toml          # Cloudflare Pages/Workers 配置
└── src/
    ├── main.ts            # 入口，挂载 UI
    ├── core/              # Tool 接口与注册表（可扩展核心）
    ├── tools/             # 各功能实现（即插即用）
    └── ui/                # 工具列表/上传/下载组件
```

- 前端用 **Vite** 构建为静态资源，`dist/` 部署到 **Cloudflare Pages**。
- 纯前端阶段无需 Worker；如需高保真 API，新增 `worker/` 目录并用 `wrangler deploy`。

### 7.2 wrangler.toml（Pages 示例）

```toml
name = "pdf-toolkit"
pages_build_output_dir = "dist"
# 可选：高保真 Worker
# [env.production.workers]
```

### 7.3 部署命令

```bash
npm install
npm run build          # 输出 dist/
npx wrangler pages deploy dist   # 部署到 Cloudflare Pages
```

### 7.4 进阶（可选）

- 自定义域名 + 免费 SSL（Cloudflare 自动）。
- 高保真转换：Cloudflare **Workers** 代理商业 API，或 **Containers（Beta）** 运行 LibreOffice。
- 大文件/结果暂存：Cloudflare **R2**（短 TTL，处理完即删）。
- 用量与配置：Cloudflare **D1/KV**。

---

## 8. 开发里程碑 / 路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| M1 | 脚手架 + ToolRegistry 核心 + 合并/拆分/旋转 | ✅ 已完成（2026-07-11） |
| M2 | 压缩、加密解密、水印页码、图片↔PDF、PDF→图片/文本 | ✅ 已完成（2026-07-11） |
| M3 | Word/Excel→PDF 基础版、PDF→Word 文本级、HTML→PDF 栅格化 | ✅ 已完成（2026-07-11） |
| M4 | UI 打磨（拖拽排序、缩略图预览、批量）、PWA 离线、Web Worker 分块、UI 重构（分类卡片网格 + 深浅主题切换） | ✅ 已完成（2026-07-11） |
| M5 | 可选高保真：Worker/Containers + 商业 API、OCR | ⏳ 待定 |

---

## 9. 风险与对策

| 风险 | 对策 |
|------|------|
| 纯前端 PDF↔Office 保真度低 | 明确产品定位为"快速/隐私优先"；高保真走可选服务端 |
| 大文件内存占用 / 卡顿 | Web Worker + 分块 + 流式处理；限制单文件大小并提示 |
| 浏览器兼容性（pdf.js Worker） | 固定版本、正确配置 worker URL；提供降级提示 |
| 加密权限可被绕过 | 仅作软限制并明示用户 |
| Cloudflare 对大静态资源/带 wasm 的限制 | 用 Pages 托管；WASM 走 R2/CF 缓存；必要时分片 |

---

## 10. 附录

- 调研平台：iLovePDF、Smallpdf、Adobe Acrobat Online、PDF24 Tools、Sejda、ConvertKr。
- 核心库：pdf-lib、pdfjs-dist、jsPDF、pdfmake、mammoth、docx、SheetJS、tesseract.js、html2canvas。
- 部署：Cloudflare Pages / Workers / R2 / D1 / KV / Containers(Beta)。
- 代码骨架：见 `./dev`（ToolRegistry 模式 + 合并/旋转示例）。

---

## 11. 实现进度跟踪（M1 + M2）

> 详细流水（含报错、优化点、待办）见同目录 `开发日志.md`。此处仅记录已落地功能与架构现状。

### 11.1 已落地工具（15 个，全部纯前端、文件不离浏览器；注册表 id 为短 slug，如 `merge`/`split`/`word-to-pdf`）

| 工具 id | 标题 | 技术 | 说明 |
|---------|------|------|------|
| `merge-pdf` | PDF 合并 | pdf-lib | 多文件，UI 拖拽排序 |
| `split-pdf` | PDF 拆分 | pdf-lib | 每页/固定页数/自定义范围 |
| `rotate-pdf` | PDF 旋转 | pdf-lib | 0/90/180/270 |
| `compress-pdf` | PDF 压缩 | pdf.js + pdf-lib | 重绘为低清 JPEG，对扫描件有效 |
| `encrypt-pdf` | PDF 加密 | pdf-lib | 打开密码 + 权限密码 |
| `decrypt-pdf` | PDF 解密 | pdf-lib | 输密码去加密 |
| `watermark-pdf` | PDF 水印 | pdf-lib | 平铺斜向半透明文字（标准字体=英文/数字） |
| `pagenumber-pdf` | PDF 页码 | pdf-lib | 数字页码，3 位置可选 |
| `image-to-pdf` | 图片转 PDF | pdf-lib | PNG/JPG 多图转一 PDF |
| `pdf-to-image` | PDF 转图片 | pdf.js | 逐页渲染 PNG |
| `pdf-to-text` | PDF 提取文本 | pdf.js | 文本层 → .txt |

### 11.2 架构现状

- `src/core/types.ts`：统一 `Tool` 接口（`id/title/description/accept/multiple/workerSafe/fields/run`）+ `ToolInput`（`files`+`options`）+ `ToolOutput`（`ToolResultFile[]`）。
- `src/core/registry.ts`：注册表，UI 只依赖它与统一接口。
- `src/core/io.ts`：单/多文件下载、文件名推导。
- `src/core/pdfjs.ts`：PDF.js 封装（worker 经 Vite `?url` 引入），含 `loadPdf/renderPage/extractText`。
- `src/ui/ui.ts`：通用「首页分类卡片网格 → 选择工具 → 上传 → 参数 → 处理 → 下载」流程；首页按 `tool-meta.ts` 的分类（合并与拆分/页面编辑/格式转换/安全加密/优化压缩）分组展示 15 个工具图标卡片；自动按 `fields` 渲染表单；多文件显示排序/删除；进度条；结果逐个下载或「全部下载」；支持深浅主题切换（localStorage 记忆）。
- `src/tools/*`：每个功能一个文件，`import` 进 `src/tools/index.ts` 即自动注册。

### 11.3 已知限制（待 M4/M5 解决）

1. **水印/页码中文**：当前用标准字体（Helvetica），仅支持英文/数字；中文需嵌入 CJK 字体（较大，后续按需加，建议 M5）。
2. **压缩对矢量 PDF 可能变⼤**：本质是「页面栅格化」，对纯文本矢量 PDF 不友好；UI 已注明适用场景。
3. **PDF→文本对扫描件为空**：需 OCR（M5）。
4. **大文件内存**：M4 已加单文件 50MB 上限 + 纯 pdf-lib 工具 Worker 分块；超大/超多文件仍需关注（可加列表虚拟化）。
5. **缩略图**：M4 已加（PDF 首页 + 图片原生）。

### 11.4 M4 落地内容（2026-07-11）

- **缩略图预览**：`renderThumb()` 用 pdf.js 渲染 PDF 首页（0.25 缩放）、图片用对象 URL；按 `name+size` 缓存。
- **单文件大小限制**：`MAX_FILE_MB=50`，超限跳过并友好提示。
- **空结果/批处理失败提示**：结果区为空显示说明；批处理部分失败在状态栏标注。
- **批量处理**：单文件工具一次选多文件逐个处理汇总；多文件工具整体处理保留排序。
- **PWA 离线**：`public/manifest.webmanifest` + `icon.svg` + `sw.js`（运行时缓存）；`main.ts` 仅生产环境注册；`index.html` 链 manifest。
- **Web Worker 分块**：`Tool.workerSafe` 声明 + `src/worker/runner.ts` 在 Worker 执行纯 pdf-lib 工具；异常/超时（60s）回退主线程。构建产物已拆分 `runner-*.js` 独立 chunk。

### 11.5 M3 落地内容（2026-07-11）

新增 4 个工具（均为纯前端，依赖 DOM 故在主线程执行，不标 workerSafe）：

| 工具 id | 标题 | 技术 | 说明 |
|---------|------|------|------|
| `word-to-pdf` | Word 转 PDF | mammoth + html2canvas/jspdf | docx→HTML→栅格化 PDF；保留文本结构，图片可能不全 |
| `excel-to-pdf` | Excel 转 PDF | SheetJS(xlsx) + html2canvas/jspdf | 每工作表一页；保留数据表格，样式简化 |
| `pdf-to-word` | PDF 转 Word（文本级） | pdf.js + docx | 按页提取文本层生成 .docx，每页间分页；无原排版/图片 |
| `html-to-pdf` | HTML 转 PDF | html2canvas/jspdf | HTML 字符串栅格化；适合内联样式自包含页面 |

架构补充：
- 新增 `core/html2pdf.ts`：`htmlToPdf(el)`（DOM 元素→多页 PDF）+ `createRenderHost(html, orientation)`（离屏渲染宿主）。
- `core/pdfjs.ts` 新增 `extractPageText(doc, pageNum)`（按行聚合，供 PDF→Word 使用）。
- **构建优化**：`vite.config.ts` 加 `manualChunks` 将 pdfjs/pdflib/html2pdf/office 拆为独立 chunk；4 个 M3 工具在 `run()` 内动态 `import()` 重型库，使其仅在运行时按需加载。主包仅 22KB，首屏不含 mammoth/xlsx/docx/html2canvas。
- 4 个工具均已 `import` 进 `src/tools/index.ts` 自动注册。

已知限制（M3 / 待 M5 解决）：
1. Word/Excel→PDF 为**栅格化**，文本不可再选；docx 内嵌图片、xlsx 单元格颜色/字体样式可能丢失。
2. PDF→Word 为**文本级**，无原排版、无图片、无字体还原；扫描件（无文本层）为空。
3. HTML→PDF 无法加载外部 CSS/图片（html2canvas 限制），依赖外链资源的页面会缺样式。
4. 这些工具未入 Web Worker（依赖 DOM），大文件时主线程可能短暂卡顿。

### 11.6 UI 重构（2026-07-11）

将原先「左侧工具列表 + 右侧工作区」的朴素布局，重构为现代化、可上线的产品界面，**处理核心逻辑（ToolRegistry / Worker 分块 / 缩略图 / 批量）完全保留**。

- **新增 `src/ui/tool-meta.ts`**：集中维护每个工具的图标（emoji）与分类（`merge/edit/convert/secure/optimize`），与设计解耦；首页分组顺序与图标一处可改，新增工具只需补一行。
- **首页 = 分类卡片网格**：按 5 个分类分组展示 15 个工具卡片（图标 + 标题 + 描述），`auto-fill minmax` 响应式网格；点击卡片进入对应工作台。
- **工作台结构升级**：顶部「← 全部工具」返回 + 面包屑（分类 / 工具名）；工具 hero（大图标 + 标题 + 描述）；统一的 `.panel` 卡片承载上传/参数/进度/结果。
- **深浅双主题**：`[data-theme]` + CSS 变量，深/浅两套配色；右上角按钮一键切换并写入 `localStorage`；首屏同步按钮图标，无闪烁。
- **细节打磨**：拖拽区大图标 + hover/拖入高亮 + 已选文件计数；文件列表显示缩略图 + 文件名 + 大小；结果下载改为描边式 `下载` 按钮 + 文件名；状态条 ok/err 用浅色背景区分；移动端响应式（网格降列、内边距收窄）。
- **构建验证**：`npm run build` 通过，主包 `index-*.js` 25.6KB（gzip 10.4KB），vendor（pdfjs/pdflib/office/html2pdf）仍按 manualChunks 按需异步加载；chunk >500KB 仅为 advisory 警告。

> 说明：因沙箱无法启动 Chrome，本次 UI 仅经 `vite build` 通过 + 代码审查验证，未做真机浏览器交互测试；上线前建议本地 `npm run dev` 实际点一遍。

### 11.7 部署准备（2026-07-11）

目标：把纯前端产物托管到 **Cloudflare Pages**（零后端、自带 CDN/HTTPS）。沙箱无 wrangler、无账号凭据，故本步只完成**配置 + 手册 + 代码加固**，最后「登录账号并推送」由用户本人执行。

新增/改动文件：
- **`wrangler.toml`**：声明 `name = "pdf-toolkit"`、`pages_build_output_dir = "dist"`；用法 `wrangler pages deploy dist` / `wrangler pages dev dist`。
- **`public/_headers`**：`/assets/*` 长缓存（immutable）、`/sw.js` 不缓存；随构建进入 `dist/` 根目录，Pages 会读取生效。
- **`README_部署.md`**：完整部署手册，覆盖**方式一 wrangler 命令行**（当前无 Git，推荐）与**方式二 Dashboard + Git 自动部署**，含自定义域名、Node 版本、子路径注意与排错表。
- **`src/core/pdfjs.ts`**：`workerSrc` 由相对字符串改为 `new URL(workerUrl, import.meta.url).href`，按**模块地址**解析 worker，根路径/子路径都不会 404（压缩/转图/提取文本依赖此）。
- **`src/main.ts`**：SW 注册由 `/sw.js` 改为 `import.meta.env.BASE_URL + 'sw.js'`，兼容子路径。
- **`package.json`**：加 `engines.node >=18`；Dashboard 部署建议再设环境变量 `NODE_VERSION=22`（Vite 5 需 18+）。
- **`.gitignore`**：忽略 `node_modules`/`dist`。

构建验证：`npm run build` 通过；产物确认 `new URL("pdf.worker...", import.meta.url)` 与 `serviceWorker.register("./sw.js")` 均已正确生成；`dist/_headers` 存在；主包 `index-*.js` 25.8KB（gzip 10.45KB）。

待用户执行：① `npm install -g wrangler` → `wrangler login` → `npm run build && wrangler pages deploy dist`；或 ② 推 Git 后在 Dashboard 连仓库部署（构建命令 `npm run build`、输出 `dist`、环境变量 `NODE_VERSION=22`）。
