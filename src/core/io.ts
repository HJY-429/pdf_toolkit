// 核心：文件下载与命名辅助

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

/** 从原文件名推导输出名，如 a.pdf -> a.merged.pdf */
export function deriveName(original: string, suffix: string, ext = 'pdf'): string {
  const dot = original.lastIndexOf('.');
  const base = dot > 0 ? original.slice(0, dot) : original;
  return `${base}.${suffix}.${ext}`;
}
