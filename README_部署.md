# PDF 工具箱 · 部署手册

本项目是**纯前端**应用（文件全程在浏览器内处理，不经过任何服务器），因此只需把 `dist/` 这一堆静态文件托管出去即可。Cloudflare Pages 是零成本、自带 CDN 和 HTTPS 的好选择。

> 准备工作：本地已装好 Node.js 18+。本目录（`dev/`）已包含完整源码；部署用的只是 `npm run build` 生成的 `dist/` 文件夹。

---

## 方式一：wrangler 命令行部署（推荐，无需 Git）

当前项目还没有 Git 仓库，用命令行最直接，不用先把代码推到 GitHub。

### 1. 安装并登录 wrangler

```bash
# 安装 Cloudflare 官方部署工具（只需一次）
npm install -g wrangler
# 或临时用：npx wrangler ...（下面命令里的 wrangler 都换成 npx wrangler）

# 登录你的 Cloudflare 账号（会打开浏览器授权）
wrangler login
```

### 2. 本地先构建

```bash
npm install      # 首次或依赖变动时执行
npm run build    # 生成 dist/
```

### 3. 部署上线

```bash
wrangler pages deploy dist
```

- 首次会问项目名称，输入 `pdf-toolkit`（或你喜欢的名字）。
- 成功后返回一个 `https://pdf-toolkit-xxxx.pages.dev` 地址，直接打开就能用。
- 以后每次改完代码：`npm run build && wrangler pages deploy dist`。

### 4.（可选）本地预览生产效果

```bash
wrangler pages dev dist
```

它会起一个接近线上环境的本地服务，用来验收构建产物（比 `npm run dev` 更接近真实）。

---

## 方式二：Cloudflare Dashboard 部署（Git 集成，适合长期维护）

如果你打算持续迭代、用 Git 管版本，推荐这条：连上 Git 后，每次 `git push` 自动部署。

### 1. 把代码推到 Git

```bash
cd dev
git init
git add .
git commit -m "init pdf toolkit"
# 在 GitHub / GitLab 新建空仓库，然后：
git remote add origin <你的仓库地址>
git push -u origin main
```

### 2. 在 Cloudflare Dashboard 创建 Pages 项目

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com) → 左侧 **Workers 和 Pages** → **创建** → **Pages** → **连接到 Git**。
2. 授权并选中刚才的仓库。
3. 设置构建：
   - **框架预设**：选 `Vite`（或留空，手动填下面两项）
   - **构建命令**：`npm run build`
   - **构建输出目录**：`dist`
4. **环境变量（重要）**：在「环境变量」里加一条
   - `NODE_VERSION` = `22`（Cloudflare 默认 Node 可能偏旧，Vite 5 需要 18+，指定 22 最稳）
5. 点击 **保存并部署**。

### 3. 之后的更新

改完代码 `git push` 即可，Cloudflare 会自动重新构建并发布。

---

## 自定义域名（可选）

在 Dashboard 的 Pages 项目里 → **自定义域** → 填入你的域名（如 `pdf.your.com`），按提示去 DNS 加一条 CNAME 指向 `pdf-toolkit-xxxx.pages.dev` 即可。免费 HTTPS 自动搞定。

---

## 已知注意点 / 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 页面打不开 / 白屏 | 先 `npm run build` 确认本地能出 `dist/`；再看构建日志有无报错。 |
| 压缩、PDF 转图片、提取文本功能失效 | 多半是 pdf.js 的 worker 没加载到。本项目已用 `new URL(workerUrl, import.meta.url)` 按模块地址解析，根路径/子路径都兼容；若仍异常，打开浏览器控制台看 `pdf.worker` 是否 404。 |
| PWA 安装/离线不生效 | Service Worker 只在 **HTTPS**（或 localhost）下生效；`pages.dev` 自带 HTTPS，正常。若部署到子路径，需同步调整 `public/manifest.webmanifest` 里的 `start_url`/`scope` 与图标路径。 |
| 构建报 Node 版本错 | 在 Dashboard 环境变量设 `NODE_VERSION=22`；或本地用 Node 18+ 构建后走方式一。 |
| 想部署到子目录而非根域名 | `vite.config.ts` 已设 `base: './'` 支持相对路径；但 `public/manifest.webmanifest` 的 `start_url`/`scope`/图标目前是绝对路径，需改成 `./` 才能完全兼容子路径。 |

---

## 已做的部署加固（本目录内）

- `wrangler.toml`：声明 Pages 项目名与产物目录 `dist`。
- `public/_headers`：带哈希的 `/assets/*` 长缓存、`/sw.js` 不缓存，提升性能与更新及时性。
- `src/core/pdfjs.ts`：worker 路径改为按模块地址解析，避免子路径 404。
- `src/main.ts`：Service Worker 用 `BASE_URL` 相对注册，兼容子路径。
- `package.json`：加 `engines.node >=18`，并在 Dashboard 用 `NODE_VERSION=22` 兜底。
- `.gitignore`：忽略 `node_modules`/`dist`，避免误提交。

> 说明：实际「推送到你的 Cloudflare 账号」这一步必须由你本人操作（涉及账号授权），我这边只完成了配置与手册准备。沙箱环境也无法替你执行 `wrangler login` / `deploy`。
