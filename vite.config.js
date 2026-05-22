import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    host: true, // Дозволяє доступ по локальній мережі (Wi-Fi)
    port: 5180  // Порт без попередньої історії HTTPS
  }
})



