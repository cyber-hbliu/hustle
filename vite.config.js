import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base — works for GitHub Pages, any subpath, or file:// opening
  base: './',
  server: {
    port: 5173,
    open: true
  }
})
