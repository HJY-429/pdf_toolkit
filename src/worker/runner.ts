/// <reference lib="webworker" />
// Web Worker 运行器：仅执行纯 pdf-lib 类工具（无 DOM 依赖），
// 通过消息与主线程通信，保持 UI 响应。失败时由主线程回退。
import '../tools/merge';
import '../tools/split';
import '../tools/rotate';
import '../tools/encrypt';
import '../tools/decrypt';
import '../tools/watermark';
import '../tools/pagenumber';
import '../tools/image-to-pdf';
import '../tools/pdf-to-image';
import '../tools/compress';
import '../tools/pdf-to-text';
import { registry } from '../core/registry';

type RunMsg = {
  type: 'run';
  id: string;
  reqId: string;
  files: File[];
  options: Record<string, any>;
};

self.onmessage = async (e: MessageEvent<RunMsg>) => {
  const msg = e.data;
  if (!msg || msg.type !== 'run') return;
  const tool = registry.get(msg.id);
  if (!tool) {
    self.postMessage({ type: 'error', reqId: msg.reqId, message: `未找到工具 ${msg.id}` });
    return;
  }
  try {
    const results = await tool.run(
      { files: msg.files, options: msg.options },
      { onProgress: (ratio, label) => self.postMessage({ type: 'progress', reqId: msg.reqId, ratio, label }) },
    );
    self.postMessage({ type: 'done', reqId: msg.reqId, results });
  } catch (err: any) {
    self.postMessage({ type: 'error', reqId: msg.reqId, message: err?.message || String(err) });
  }
};
