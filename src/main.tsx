import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const manifestLink = document.createElement('link');
manifestLink.rel = 'manifest';
manifestLink.href = '/manifest.webmanifest';
document.head.appendChild(manifestLink);

const themeColor = document.createElement('meta');
themeColor.name = 'theme-color';
themeColor.content = '#e23744';
document.head.appendChild(themeColor);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.error('Service worker registration failed:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
