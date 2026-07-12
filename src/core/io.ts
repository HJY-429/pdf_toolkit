// 核心：文件下载与命名辅助
import { zip } from 'fflate';

/** 触发浏览器下载单个 Blob */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 依次下载多个文件（间隔避免浏览器拦截） */
export async function downloadAll(files: { blob: Blob; name: string }[], gap = 300): Promise<void> {
  for (const f of files) {
    download(f.blob, f.name);
    await new Promise((r) => setTimeout(r, gap));
  }
}

/**
 * 将多个文件打包为 ZIP 并下载（用于输出文件较多时，避免逐一下载）。
 * @param files 待打包文件
 * @param zipName 下载的压缩包文件名（不含 .zip 后缀也会自动补）
 */
export async function downloadZip(files: { blob: Blob; name: string }[], zipName = 'pdf-toolkit'): Promise<void> {
  // Blob -> Uint8Array
  const entries: Record<string, Uint8Array> = {};
  await Promise.all(
    files.map(async (f, i) => {
      const buf = new Uint8Array(await f.blob.arrayBuffer());
      // 同名兜底：加序号前缀避免互相覆盖
      const name = f.name || `file-${i + 1}`;
      entries[files.some((g, j) => j < i && g.name === name) ? `${i + 1}-${name}` : name] = buf;
    }),
  );
  await new Promise<void>((resolve, reject) => {
    zip(entries, { level: 0 }, (err, data) => {
      if (err) return reject(err);
      const blob = new Blob([data], { type: 'application/zip' });
      const finalName = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
      download(blob, finalName);
      resolve();
    });
  });
}

/** 从原文件名推导输出名，如 a.pdf -> a.merged.pdf */
export function deriveName(original: string, suffix: string, ext = 'pdf'): string {
  const dot = original.lastIndexOf('.');
  const base = dot > 0 ? original.slice(0, dot) : original;
  return `${base}.${suffix}.${ext}`;
}
