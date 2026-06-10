import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

const notifyUpdateAvailable = (registration) => {
  window.dispatchEvent(new CustomEvent('nutrisnap-update-available', {
    detail: { registration }
  }))
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`
    const serviceWorkerScope = import.meta.env.BASE_URL

    navigator.serviceWorker.register(serviceWorkerUrl, { scope: serviceWorkerScope })
      .then((registration) => {
        console.log('PWA Service Worker зареєстровано:', registration.scope)

        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdateAvailable(registration)
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdateAvailable(registration)
            }
          })
        })
      })
      .catch((err) => {
        console.error('Помилка реєстрації Service Worker:', err)
      })
  })

  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true
      window.location.reload()
    }
  })
}
