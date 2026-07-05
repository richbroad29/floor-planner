import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base must match the GitHub Pages project path: richbroad29.github.io/floor-planner/
export default defineConfig({
  base: '/floor-planner/',
  plugins: [react()],
})
