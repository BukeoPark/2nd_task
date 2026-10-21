import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// 랜딩('/')과 지도('/map')는 모두 이 앱이 낸다(주소 규칙은 src/lib/route.ts). 개발 서버는 없는 경로를 index.html 로 돌려주므로 직접 접속·새로고침이 된다.
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'may-slot-isolation-citation.trycloudflare.com'
    ]
  }
})
