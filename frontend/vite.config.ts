import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** 개발 서버: 주소창에 앱 주소만(쿼리 없이) 입력하면 랜딩페이지로 보낸다.
 * 랜딩의 시작 버튼은 `/?mode=...` 로 오므로 쿼리가 있으면 그대로 앱이 열린다. 랜딩 주소는 VITE_LANDING_URL(기본 http://localhost:3000). */
function landingFirst(landingUrl: string): Plugin {
  return {
    name: 'landing-first',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const accepts = String(req.headers.accept ?? '')
        if (req.method === 'GET' && req.url === '/' && accepts.includes('text/html') && landingUrl) {
          res.statusCode = 302
          res.setHeader('Location', landingUrl)
          res.end()
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const landingUrl = (env.VITE_LANDING_URL ?? 'http://localhost:3000').trim().replace(/\/+$/, '')
  return {
    plugins: [react(), landingFirst(landingUrl)],
    server: {
      allowedHosts: [
        'may-slot-isolation-citation.trycloudflare.com'
      ]
    }
  }
})
