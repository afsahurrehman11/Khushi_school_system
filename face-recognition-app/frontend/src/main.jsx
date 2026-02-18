import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// wiring to forward browser console logs to backend for easier debugging.
// Buffer logs until the App detects `apiBase` and calls `window.__client_log_send(apiBase)`.
window.__client_log_buffer = [];
['log','info','warn','error'].forEach(level=>{
  const orig = console[level].bind(console);
  console[level] = (...args)=>{
    try{ window.__client_log_buffer.push({level, msg: args.map(a=>{ try { return JSON.stringify(a) } catch { return String(a) } }).join(' ') }); }catch(e){}
    orig(...args);
  }
});

window.__client_log_send = function(apiBase){
  if (!apiBase) return;
  const endpoint = apiBase.replace(/:\d+$/, ':8000') + '/client-log';
  // actually use the resolved apiBase port if provided
  const url = apiBase + '/client-log';
  // flush buffer
  while(window.__client_log_buffer && window.__client_log_buffer.length){
    const item = window.__client_log_buffer.shift();
    try{ fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)}).catch(()=>{}); }catch(e){}
  }
  // install live forwarder
  ['log','info','warn','error'].forEach(level=>{
    const orig = console[level].bind(console);
    console[level] = (...args)=>{
      try{ const payload = {level, msg: args.map(a=>{ try { return JSON.stringify(a) } catch { return String(a) } }).join(' ')}; fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}).catch(()=>{}); }catch(e){}
      orig(...args);
    }
  })
}
