import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    base: mode === 'production' ? '/nutri-snap/' : '/',
    plugins: [
      react(),
      {
        name: 'nutrisnap-ai-proxies',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/openai/responses')) {
              if (req.method !== 'POST') {
                res.statusCode = 405
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: { message: 'Method not allowed' } }))
                return
              }

              if (!env.OPENAI_API_KEY) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: { message: 'OPENAI_API_KEY is not configured' } }))
                return
              }

              let body = ''
              req.setEncoding('utf8')
              req.on('data', chunk => {
                body += chunk
              })
              req.on('end', async () => {
                try {
                  const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                      'Content-Type': 'application/json'
                    },
                    body
                  })
                  const responseText = await openAiResponse.text()
                  res.statusCode = openAiResponse.status
                  res.setHeader('Content-Type', openAiResponse.headers.get('content-type') || 'application/json')
                  res.end(responseText)
                } catch {
                  res.statusCode = 502
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ error: { message: 'OpenAI proxy request failed' } }))
                }
              })
              return
            }

            if (!req.url?.startsWith('/api/gemini/')) {
              next()
              return
            }

            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'Method not allowed' } }))
              return
            }

            if (!env.GEMINI_API_KEY) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'GEMINI_API_KEY is not configured' } }))
              return
            }

            const modelName = decodeURIComponent(req.url.split('/api/gemini/')[1]?.split('?')[0] || '')
            if (!modelName) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'Gemini model is required' } }))
              return
            }

            let body = ''
            req.setEncoding('utf8')
            req.on('data', chunk => {
              body += chunk
            })
            req.on('end', async () => {
              try {
                const geminiResponse = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body
                  }
                )
                const responseText = await geminiResponse.text()
                res.statusCode = geminiResponse.status
                res.setHeader('Content-Type', geminiResponse.headers.get('content-type') || 'application/json')
                res.end(responseText)
              } catch {
                res.statusCode = 502
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: { message: 'Gemini proxy request failed' } }))
              }
            })
          })
        }
      }
    ],
    server: {
      host: true,
      port: 5180
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React + ReactDOM → vendor chunk (кешується назавжди)
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
            // Lucide icons → окремий chunk
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            // База продуктів → окремий chunk (108KB, рідко змінюється)
            if (id.includes('/src/data/products') || id.includes('/src/data/ukrainianProductSeeds')) {
              return 'data-products';
            }
            // AI-сервіси → окремий chunk
            if (id.includes('/src/services/')) {
              return 'services';
            }
          }
        }
      }
    },
    test: {
      globals: true,
      environment: 'jsdom'
    }
  }
})
