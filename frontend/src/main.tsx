import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Use contextBridge (guard against preload failure)
if (window.ipcRenderer && typeof window.ipcRenderer.on === 'function') {
  window.ipcRenderer.on('main-process-message', (_event, message) => {
    console.log(message)
  })
}
