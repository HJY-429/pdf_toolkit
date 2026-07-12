import './style.css';
import { registry } from '../tools';
import type { Tool, ToolField, ToolOutput } from '../core/types';
import { download, downloadAll } from '../core/io';
import { loadPdf, renderPage } from '../core/pdfjs';
import { CATEGORIES, metaOf } from './tool-meta';

interface State {
  tool: Tool | null;
  files: File[];
  running: boolean;
  resultUrls: string[];
}
const state: State = { tool: null, files: [], running: false, resultUrls: [] };

const MAX_FILE_MB = 50; // 单文件大小上限，超限给出友好提示并跳过
const thumbCache = new Map<string, string>(); // 缩略图缓存：key = name+size -> dataURL
const THEME_KEY = 'pdfbox-theme';

const app = document.querySelector<HTMLDivElement>('#app')!;

function el(tag: string, props: Record<string, any> = {}, children: (Node | string)[] = []): HTMLElement {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  });
  children.forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return node;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---------- 主题 ----------
function applyTheme(t: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* 忽略隐私模式写入失败 */
  }
  const btn = document.querySelector('#themeBtn');
  if (btn) btn.textContent = t === 'light' ? '☀️' : '🌙';
}
function initTheme() {
  let t: string | null = null;
  try {
    t = localStorage.getItem(THEME_KEY);
  } catch {
    /* ignore */
  }
  applyTheme(t === 'light' ? 'light' : 'dark');
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(cur === 'light' ? 'dark' : 'light');
}

function resetUrls() {
  state.resultUrls.forEach((u) => URL.revokeObjectURL(u));
  state.resultUrls = [];
}

// ---------- 外壳 ----------
function renderShell() {
  app.innerHTML = '';
  const header = el('header', { class: 'site-header' }, [
    el('div', { class: 'brand' }, [
      el('span', { class: 'logo' }, ['📄']),
      el('div', { class: 'brand-text' }, [
        el('span', { class: 'brand-name' }, ['PDF 工具箱']),
        el('span', { class: 'brand-tag' }, ['纯前端处理 · 文件不上传']),
      ]),
    ]),
    el('div', { class: 'header-actions' }, [
      el('button', { class: 'theme-btn', id: 'themeBtn', title: '切换深浅色', onclick: () => toggleTheme() }, ['🌙']),
    ]),
  ]);
  const view = el('div', { class: 'view', id: 'view' });
  app.append(header, view);
  // 同步主题按钮图标（首屏可能在 initTheme 时按钮尚不存在）
  const btn = document.querySelector('#themeBtn') as HTMLElement | null;
  if (btn) btn.textContent = document.documentElement.getAttribute('data-theme') === 'light' ? '☀️' : '🌙';
  renderHome();
}

// ---------- 首页：分类工具卡片网格 ----------
function renderHome() {
  const view = document.querySelector('#view')!;
  view.innerHTML = '';

  view.appendChild(
    el('section', { class: 'hero' }, [
      el('h1', {}, ['本地处理所有 PDF，文件永不离开你的浏览器']),
      el('p', {}, ['15 个工具，覆盖合并、拆分、转换、加密、压缩。纯前端运行，隐私零风险。']),
    ]),
  );

  CATEGORIES.forEach((cat) => {
    const tools = registry.list().filter((t) => metaOf(t.id).category === cat.key);
    if (!tools.length) return;
    const section = el('section', { class: 'cat' }, [
      el('div', { class: 'cat-head' }, [
        el('span', { class: 'cat-icon' }, [cat.icon]),
        el('h2', {}, [cat.label]),
        el('span', { class: 'cat-count' }, [`${tools.length} 个工具`]),
      ]),
    ]);
    const grid = el('div', { class: 'grid' });
    tools.forEach((t) => {
      const m = metaOf(t.id);
      grid.appendChild(
        el('button', { class: 'tool-card', onclick: () => selectTool(t) }, [
          el('span', { class: 'tool-icon' }, [m.icon]),
          el('span', { class: 'tool-title' }, [t.title]),
          el('span', { class: 'tool-desc' }, [t.description]),
        ]),
      );
    });
    section.appendChild(grid);
    view.appendChild(section);
  });

  view.appendChild(
    el('footer', { class: 'site-footer' }, [
      el('span', {}, ['🔒 全部处理在本地完成 · 无需上传 · 可离线使用（PWA）']),
    ]),
  );
}

function selectTool(t: Tool) {
  resetUrls();
  state.tool = t;
  state.files = [];
  renderWorkspace();
}
function backHome() {
  resetUrls();
  state.tool = null;
  state.files = [];
  renderHome();
}

// ---------- 工作台 ----------
function renderWorkspace() {
  const view = document.querySelector('#view')!;
  view.innerHTML = '';
  const t = state.tool!;
  const m = metaOf(t.id);
  const cat = CATEGORIES.find((c) => c.key === m.category);

  view.appendChild(
    el('div', { class: 'ws-top' }, [
      el('button', { class: 'back-btn', onclick: () => backHome() }, ['← 全部工具']),
      el('div', { class: 'ws-crumb' }, [
        el('span', {}, [cat ? cat.label : '工具']),
        el('span', { class: 'sep' }, ['/']),
        el('span', {}, [t.title]),
      ]),
    ]),
  );

  view.appendChild(
    el('div', { class: 'ws-hero' }, [
      el('span', { class: 'ws-icon' }, [m.icon]),
      el('div', {}, [el('h1', {}, [t.title]), el('p', {}, [t.description])]),
    ]),
  );

  const card = el('div', { class: 'panel' });

  // 上传区
  const input = el('input', {
    type: 'file',
    accept: t.accept.join(','),
    multiple: 'true',
    style: 'display:none',
    onchange: (e: Event) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      addFiles(files);
    },
  }) as HTMLInputElement;

  const dz = el('div', { class: 'dropzone', id: 'dropzone' }, [
    el('div', { class: 'dz-icon' }, ['⬆️']),
    el('div', { class: 'dz-text', id: 'dztext' }, ['点击选择，或拖拽文件到此处']),
    el('div', { class: 'dz-hint' }, [
      `支持 ${t.accept.join(' / ')}${t.multiple ? '，可多选并排序' : '，可多选批量处理'}`,
    ]),
  ]);
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('drag');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag');
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => t.accept.includes(f.type));
    addFiles(files);
  });
  card.append(input, dz);

  // 文件列表
  card.appendChild(el('ul', { class: 'filelist', id: 'filelist' }));

  // 参数表单
  if (t.fields?.length) {
    const form = el('div', { id: 'fields' });
    t.fields.forEach((f) => form.appendChild(renderField(f)));
    card.appendChild(form);
  }

  // 处理按钮 + 进度 + 结果 + 状态
  const runBtn = el('button', { class: 'run-btn', id: 'runBtn', onclick: () => runTool() }, ['开始处理']);
  const progress = el('div', { class: 'progress', id: 'progress' }, [
    el('div', { class: 'bar' }, [el('i', { id: 'barfill' })]),
    el('div', { class: 'label', id: 'prolabel' }, ['']),
  ]);
  const result = el('div', { class: 'result', id: 'result' });
  const status = el('div', { class: 'status', id: 'status' }, ['']);

  card.append(runBtn, progress, result, status);
  view.appendChild(card);
  renderFileList();
}

function renderField(f: ToolField): HTMLElement {
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, [f.label]));
  if (f.type === 'select') {
    const sel = el('select', { 'data-key': f.key }) as HTMLSelectElement;
    (f.options || []).forEach((o) => sel.appendChild(el('option', { value: String(o.value) }, [o.label])));
    if (f.default !== undefined) sel.value = String(f.default);
    wrap.appendChild(sel);
  } else if (f.type === 'number') {
    wrap.appendChild(
      el('input', {
        type: 'number',
        'data-key': f.key,
        min: f.min,
        max: f.max,
        step: f.step,
        value: f.default ?? '',
      }),
    );
  } else {
    wrap.appendChild(
      el('input', {
        type: f.type === 'checkbox' ? 'checkbox' : 'text',
        'data-key': f.key,
        placeholder: f.placeholder ?? '',
        value: f.default ?? '',
      }),
    );
  }
  return wrap;
}

function addFiles(files: File[]) {
  if (!files.length) return;
  const t = state.tool!;
  let skipped = 0;
  const accepted: File[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      skipped++;
      continue;
    }
    accepted.push(f);
  }
  state.files.push(...accepted);
  renderFileList();
  const dz = document.querySelector('#dropzone');
  const dzText = document.querySelector('#dztext');
  if (dz && dzText) {
    dzText.textContent = `已选择 ${state.files.length} 个文件（${t.multiple ? '整体处理' : '将逐个处理'}）`;
    dz.classList.add('has-files');
  }
  if (skipped > 0) setStatus(`已跳过 ${skipped} 个超过 ${MAX_FILE_MB}MB 的文件`, 'err');
  else if (accepted.length === 0) setStatus('所选文件均超过大小限制', 'err');
}

async function renderThumb(f: File): Promise<string> {
  const key = `${f.name}:${f.size}`;
  if (thumbCache.has(key)) return thumbCache.get(key)!;
  let url: string;
  if (f.type === 'application/pdf') {
    try {
      const bytes = await f.arrayBuffer();
      const doc = await loadPdf(bytes);
      const { canvas } = await renderPage(doc, 1, 0.25);
      url = canvas.toDataURL('image/png');
    } catch {
      url = '';
    }
  } else if (f.type.startsWith('image/')) {
    url = URL.createObjectURL(f);
  } else {
    url = '';
  }
  thumbCache.set(key, url);
  return url;
}

function renderFileList() {
  const list = document.querySelector('#filelist');
  if (!list) return;
  list.innerHTML = '';
  const multi = state.tool?.multiple;
  state.files.forEach((f, i) => {
    const acts = el('div', { class: 'acts' });
    if (multi) {
      acts.append(
        el('button', { onclick: () => move(i, -1), title: '上移' }, ['↑']),
        el('button', { onclick: () => move(i, 1), title: '下移' }, ['↓']),
      );
    }
    acts.appendChild(el('button', { onclick: () => remove(i), title: '移除' }, ['✕']));
    const li = el('li', {}, [
      el('span', { class: 'name' }, [`${i + 1}. ${f.name}`]),
      el('span', { class: 'size' }, [formatSize(f.size)]),
      acts,
    ]);
    list.appendChild(li);
    renderThumb(f).then((u) => {
      if (!u) return;
      const img = el('img', { class: 'thumb', src: u, alt: f.name }) as HTMLImageElement;
      li.insertBefore(img, li.firstChild);
    });
  });
}

function move(i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= state.files.length) return;
  [state.files[i], state.files[j]] = [state.files[j], state.files[i]];
  renderFileList();
}
function remove(i: number) {
  state.files.splice(i, 1);
  renderFileList();
}

function collectOptions(): Record<string, string | number | boolean> {
  const out: Record<string, any> = {};
  document.querySelectorAll<HTMLElement>('[data-key]').forEach((node) => {
    const key = node.getAttribute('data-key')!;
    if (node instanceof HTMLSelectElement || node instanceof HTMLInputElement) {
      out[key] = node.type === 'number' ? Number(node.value) : node.value;
    }
  });
  return out;
}

// ---- Web Worker 分块处理（仅 workerSafe 工具，失败回退主线程）----
let worker: Worker | null = null;

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../worker/runner.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  return worker;
}

async function executeTool(
  tool: Tool,
  files: File[],
  options: Record<string, any>,
  onProgress?: (r: number, label?: string) => void,
): Promise<ToolOutput> {
  const w = tool.workerSafe ? getWorker() : null;
  if (!w) return tool.run({ files, options }, { onProgress });
  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<ToolOutput>((resolve, reject) => {
    const timer = setTimeout(() => {
      w.removeEventListener('message', onMsg);
      reject(new Error('worker-timeout'));
    }, 60000);
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.reqId !== reqId) return;
      if (d.type === 'progress') onProgress?.(d.ratio, d.label);
      else if (d.type === 'done') {
        clearTimeout(timer);
        w.removeEventListener('message', onMsg);
        resolve(d.results);
      } else if (d.type === 'error') {
        clearTimeout(timer);
        w.removeEventListener('message', onMsg);
        reject(new Error(d.message));
      }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ type: 'run', id: tool.id, reqId, files, options });
  }).catch((err) => {
    console.warn('Worker 执行失败，回退主线程：', err);
    return tool.run({ files, options }, { onProgress });
  });
}

async function runTool() {
  const t = state.tool;
  if (!t || !state.files.length || state.running) return;
  state.running = true;
  resetUrls();
  setProgress(0, '准备中…');
  (document.querySelector('#runBtn') as HTMLButtonElement).disabled = true;
  setStatus('', '');

  const options = collectOptions();
  const total = state.files.length;
  const allResults: ToolOutput = [];
  let failed = 0;

  try {
    if (t.multiple) {
      const output = await executeTool(t, state.files, options, (r, label) =>
        setProgress(r, label || `处理中 ${Math.round(r * 100)}%`),
      );
      allResults.push(...output);
    } else if (total === 1) {
      const output = await executeTool(t, state.files, options, (r, label) =>
        setProgress(r, label || `处理中 ${Math.round(r * 100)}%`),
      );
      allResults.push(...output);
    } else {
      const errors: string[] = [];
      for (let i = 0; i < total; i++) {
        try {
          const output = await executeTool(
            t,
            [state.files[i]],
            options,
            {
              onProgress: (r, label) =>
                setProgress((i + r) / total, `处理 ${i + 1}/${total}：${label || Math.round(r * 100) + '%'}`),
            },
          );
          allResults.push(...output);
        } catch (e: any) {
          failed++;
          errors.push(`${state.files[i].name}：${e?.message || e}`);
          console.error(`文件 ${state.files[i].name} 处理失败`, e);
        }
      }
    }

    setProgress(1, '完成');
    showResult(allResults);
    if (allResults.length === 0) {
      const reason = errors[0] ? `（首个失败原因：${errors[0]}）` : '';
      setStatus(
        failed > 0 ? `处理完成，但 ${failed} 个文件失败且无输出${reason}` : '处理完成，但没有生成任何文件',
        'err',
      );
    } else {
      const extra = failed > 0 ? `（${failed} 个文件处理失败已跳过）` : '';
      setStatus(`处理完成，共 ${allResults.length} 个输出文件${extra}`, failed > 0 ? 'err' : 'ok');
    }
  } catch (err: any) {
    setProgress(0, '失败');
    setStatus('出错：' + (err?.message || err), 'err');
  } finally {
    state.running = false;
    (document.querySelector('#runBtn') as HTMLButtonElement).disabled = false;
  }
}

function setProgress(ratio: number, label: string) {
  const p = document.querySelector('#progress');
  const fill = document.querySelector<HTMLElement>('#barfill');
  const lab = document.querySelector('#prolabel');
  if (p) p.classList.add('show');
  if (fill) fill.style.width = `${Math.round(ratio * 100)}%`;
  if (lab) lab.textContent = label;
}

function showResult(output: ToolOutput) {
  const box = document.querySelector('#result')!;
  box.innerHTML = '';
  box.classList.add('show');
  if (output.length === 0) {
    box.appendChild(
      el('div', { class: 'empty' }, ['本次处理未产生可下载文件（如扫描件提取文本可能为空，或参数导致无输出）。']),
    );
    return;
  }
  output.forEach((f, i) => {
    const url = URL.createObjectURL(f.blob);
    state.resultUrls.push(url);
    const a = el('a', { class: 'dl', href: url, download: f.name }, [`下载 ${f.name}`]);
    box.appendChild(el('div', { class: 'item' }, [el('span', { class: 'fname' }, [`文件 ${i + 1} · ${f.name}`]), a]));
  });
  if (output.length > 1) {
    box.appendChild(
      el('button', {
        class: 'run-btn',
        onclick: () => downloadAll(output.map((f) => ({ blob: f.blob, name: f.name }))),
      }, ['全部下载']),
    );
  }
}

function setStatus(msg: string, kind: '' | 'ok' | 'err') {
  const s = document.querySelector('#status')!;
  s.className = 'status' + (kind ? ' ' + kind : '');
  s.textContent = msg;
}

initTheme();
renderShell();
