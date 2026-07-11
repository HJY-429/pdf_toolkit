// 入口：导入工具（触发注册）+ 启动通用 UI + 注册 Service Worker（仅生产构建）
import './tools';
import './ui/ui';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js')
      .catch((e) => console.warn('SW 注册失败', e));
  });
}
