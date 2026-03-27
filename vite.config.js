import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        components: path.resolve(__dirname, 'src/components'),
        pages: path.resolve(__dirname, 'src/pages'),
        styles: path.resolve(__dirname, 'src/styles'),
        utils: path.resolve(__dirname, 'src/utils')
      }
    },
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});
