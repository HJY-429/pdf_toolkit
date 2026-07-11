import { defineConfig } from 'vite';

// Cloudflare Pages 静态托管：build 产物输出到 dist/，相对路径便于子目录部署
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    // 将体积较大的第三方库拆分为独立 chunk，提升缓存命中与并行加载，消除超大包警告
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          pdflib: ['pdf-lib'],
          html2pdf: ['html2canvas', 'jspdf'],
          office: ['mammoth', 'xlsx', 'docx'],
        },
      },
    },
  },
});
