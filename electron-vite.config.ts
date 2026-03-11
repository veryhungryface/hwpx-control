import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedPath = resolve(__dirname, 'src/shared')

// Read package.json to externalize all deps
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
const externalDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {})
]

function manualExternalPlugin() {
  return {
    name: 'manual-externalize-deps',
    enforce: 'pre' as const,
    resolveId(source: string) {
      // Externalize all package dependencies
      if (externalDeps.some(dep => source === dep || source.startsWith(dep + '/'))) {
        return { id: source, external: true }
      }
      return null
    }
  }
}

export default defineConfig({
  main: {
    plugins: [manualExternalPlugin()],
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
