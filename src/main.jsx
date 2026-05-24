import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Реєстрація Service Worker для PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`;
    const serviceWorkerScope = import.meta.env.BASE_URL;

    navigator.serviceWorker.register(serviceWorkerUrl, { scope: serviceWorkerScope })
      .then((reg) => {
        console.log('PWA Service Worker зареєстровано:', reg.scope);
      })
      .catch((err) => {
        console.error('Помилка реєстрації Service Worker:', err);
      });
  });

  // Автоматичне перезавантаження сторінки при активації нового сервіс-воркера
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

