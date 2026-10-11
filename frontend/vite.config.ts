import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
   server: {
    allowedHosts: [
      'may-slot-isolation-citation.trycloudflare.com'
    ]
  }
})
