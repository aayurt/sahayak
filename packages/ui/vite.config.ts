import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [solidPlugin(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:9090',
      '/sidecar': {
        target: 'http://localhost:9090',
        ws: true,
      },
      '/login': 'http://localhost:9090',
    },
  },
  build: {
    target: 'es2022',
  },
})
