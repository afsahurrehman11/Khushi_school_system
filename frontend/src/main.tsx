import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import logger from './utils/logger';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Use contextBridge (guard against preload failure)
if (window.ipcRenderer && typeof window.ipcRenderer.on === 'function') {
  window.ipcRenderer.on('main-process-message', (_event, message) => {
    logger.info('MAIN', String(message));
  })
}
