# PDF 工具箱 · 部署手册

本项目是**纯前端**应用（文件全程在浏览器内处理，不经过任何服务器），只需把 `npm run build` 生成的 `dist/` 静态文件托管出去。Cloudflare Pages 提供零成本、自带 CDN 和 HTTPS 的托管。

> 环境要求：本地 Node.js 18+。`dev/` 目录为完整源码；部署产物仅 `dist/`。

---

## 部署方式

### 方式一：命令行直接上传（简单、一次性）

```bash
npm install
npm run build
npx wrangler login                      # 浏览器授权 Cloudflare 账号
npx wrangler pages project create pdf-toolkit   # 首次需先建项目
npx wrangler pages deploy dist
```

成功后返回 `https://<项目名>.pages.dev`。以后更新：`npm run build && npx wrangler pages deploy dist`。
本地预览生产效果：`npx wrangler pages dev dist`。

### 方式二：Dashboard + Git 自动部署（推荐长期维护）

连上 Git 后，每次 `git push` 自动构建发布。

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers 和 Pages** → **创建** → **Pages** → **连接到 Git** → 选仓库。
2. 构建设置：
   - **框架预设 (Framework preset)**：`None`（本项目是 Vite + TypeScript 纯前端，不是 React / VitePress）
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`
   - **环境变量**：`NODE_VERSION = 22`
3. 保存并部署。

> 必须选择 **Pages** 类型项目（闪电 ⚡ 图标），不要选成 Worker（`<>` 图标）。详见下方「Pages 与 Workers 的区别」。

> **方式二不依赖方式一的本地命令。** 上方「方式一」里的 `npx wrangler login` / `npx wrangler pages deploy dist` 是另一条**独立的 CLI 上传路径**，不是本方式的 prerequisites。只要你是**从 Dashboard 正常创建 Pages 项目并连接 Git**（即上面步骤 1–3），项目在创建那一刻即已存在，之后 `git push` 自动触发的 `wrangler pages deploy dist` 能直接找到它，无需先在本地跑任何 wrangler 命令。唯一会报 `project does not exist` 的情形是：你只在 Git 构建里写了 `wrangler pages deploy dist`，却从未在 Dashboard 或用 `wrangler pages project create` 真正建过 Pages 项目。

---

## 自定义域名（可选）

项目 → **自定义域** → 填入域名（如 `pdf.your.com`），按提示在 DNS 加 CNAME 指向 `<项目名>.pages.dev`。免费 HTTPS 自动启用。

---

## Cloudflare Pages 与 Workers 的区别（重点）

本项目用 **Pages** 部署，容易和 **Workers** 混淆，区别如下：

| 维度 | Cloudflare Pages | Cloudflare Workers |
|------|------------------|---------------------|
| 定位 | 托管**静态站点 / 前端应用**（HTML/CSS/JS 产物） | 运行**服务端代码**（无服务器函数、API、动态逻辑） |
| 典型产物 | `dist/` 静态文件 | 一个 JS 入口文件（如 `src/index.ts`）+ `main` 配置 |
| 部署命令 | `wrangler pages deploy dist` | `wrangler deploy` |
| 是否需要代码入口 | 否 | 是（`main = "src/index.ts"`） |
| 本项目用法 | ✅ 用它托管纯前端 PDF 工具箱 | 仅在「可选 M5 高保真」场景用（代理商业 API / 跑 LibreOffice） |

**常见坑（本项目实际踩过）**：在 Dashboard 误建了 **Worker** 类型项目（`<>` 图标），跑 `wrangler deploy` 会报 `Missing entry-point`、提示加 `main = "src/index.ts"`，且项目显示 `No active routes`、永远没有 `.pages.dev` 地址。本项目是纯静态，必须用 **`wrangler pages deploy dist`**，且 Dashboard 创建时选 **Pages** 类型。删掉误建的 Worker 项目、重建纯 Pages 项目后，一切正常。

---

## 已做的部署加固（本目录内）

- `wrangler.toml`：声明 Pages 项目名与产物目录 `dist`。
- `public/_headers`：`/assets/*` 长缓存、`/sw.js` 不缓存。
- `src/core/pdfjs.ts`：worker 路径按模块地址解析（`new URL(..., import.meta.url)`），根/子路径都兼容。
- `src/main.ts`：Service Worker 用 `BASE_URL` 相对注册，兼容子路径。
- `package.json`：`engines.node >=18`；Dashboard 用 `NODE_VERSION=22` 兜底。
- `.gitignore`：忽略 `node_modules`/`dist`。

---

## 排错速查

| 现象 | 处理 |
|------|------|
| 页面白屏 | 先本地 `npm run build` 确认能出 `dist/`；看构建日志有无报错。 |
| 压缩 / 转图片 / 提取文本失效 | 多半 pdf.js worker 没加载；本项目已按模块地址解析，若仍异常看控制台 `pdf.worker` 是否 404。 |
| PWA 不生效 | Service Worker 只在 HTTPS/localhost 生效，`pages.dev` 自带 HTTPS 正常。 |
| 构建报 Node 版本错 | Dashboard 环境变量设 `NODE_VERSION=22`。 |
| 部署报 `Missing entry-point` / 提示加 `main = "src/index.ts"` | 误用了 Worker 命令 `wrangler deploy`；改用 `wrangler pages deploy dist`，Dashboard 选 Pages 类型。 |
| 部署报 `Authentication error [code: 10000]` | 构建设置的 **API token** 缺「Cloudflare Pages: Edit」权限；换/建带该权限的 token 并重新选入。 |
