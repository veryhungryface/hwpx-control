import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedPath = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: [
        { find: /^@shared\/(.*)/, replacement: resolve(sharedPath, '$1') }
      ]
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: [
        { find: /^@shared\/(.*)/, replacement: resolve(sharedPath, '$1') }
      ]
    }
  },
  renderer: {
    resolve: {
      alias: [
        { find: /^@shared\/(.*)/, replacement: resolve(sharedPath, '$1') },
        { find: /^@\/(.*)/, replacement: resolve(__dirname, 'src/renderer/src', '$1') }
      ]
    },
    plugins: [react()],
    css: {
      postcss: resolve(__dirname, 'postcss.config.js')
    }
  }
})
