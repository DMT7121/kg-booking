import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  process.env.VITE_GAS_URL = env.VITE_GAS_URL

  return {
    plugins: [
      vue(),
      {
        name: 'html-transform-index',
        enforce: 'post',
        generateBundle(_, bundle) {
          if (bundle['customer.html']) {
            bundle['index.html'] = {
              ...bundle['customer.html'],
              fileName: 'index.html'
            } as any
            delete bundle['customer.html']
          }
        }
      }
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    build: {
      outDir: 'dist_customer',
      emptyOutDir: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        input: {
          customer: resolve(__dirname, 'customer.html')
        },
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/')
            if (normalizedId.includes('node_modules')) {
              if (normalizedId.includes('/vue/') || normalizedId.includes('/@vue/')) return 'vendor-vue'
              if (normalizedId.includes('/html2canvas/')) return 'vendor-html2canvas'
              if (normalizedId.includes('/pinia/')) return 'vendor-pinia'
            }
          }
        }
      }
    },
    server: {
      port: 3001,
      open: '/customer.html'
    }
  }
})
