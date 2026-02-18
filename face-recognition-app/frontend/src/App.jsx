import React, {useEffect, useState} from 'react'
import Navbar from './components/Navbar'
import Register from './components/Register'
import Recognize from './components/Recognize'
import Dashboard from './components/Dashboard'
import Attendance from './components/Attendance'

function makeCandidate(port){
  return window.location.origin.replace(/:\d+$/, `:${port}`)
}

export default function App(){
  const [tab, setTab] = useState('dashboard')
  const [backendReady, setBackendReady] = useState(false)
  const [persons, setPersons] = useState([])
  const [apiBase, setApiBase] = useState(null)

  async function fetchPersons(){
    if (!apiBase) return
    try{
      const r = await fetch(`${apiBase}/list`)
      if (!r.ok) return setPersons([])
      const j = await r.json()
      setPersons(j.registry || [])
    }catch(e){ setPersons([]) }
  }

  // probe ports 8000..8010 to discover backend (handles case where 8000 already occupied)
  useEffect(()=>{
    let mounted = true
    const envBase = import.meta.env.VITE_API_BASE
    async function detect(){
      if (envBase){
        // If a base is provided via Vite env, use it directly and check readiness once
        try{
          const r = await fetch(`${envBase}/health`, {cache:'no-store'})
          if (r.ok){
            const j = await r.json()
            if (mounted){ setApiBase(envBase); if (j.ready) setBackendReady(true) }
            return
          }
        }catch(e){ /* fallthrough to probing if provided base not reachable */ }
      }
      for(let p=8000;p<=8010;p++){
        const base = makeCandidate(p)
        try{
          const r = await fetch(`${base}/health`, {cache:'no-store'})
          if (r.ok){
            const j = await r.json()
            if (mounted){ setApiBase(base); if (j.ready) setBackendReady(true); break }
          }
        }catch(e){ /* try next port */ }
      }
      // If still not found, set a sensible fallback so the rest of the app can attempt actions
      if (!apiBase){
        const fallback = envBase || 'http://localhost:8000'
        console.warn('Could not detect backend automatically; falling back to', fallback)
        if (mounted) setApiBase(fallback)
      }
    }
    detect()
    return ()=>{ mounted=false }
  },[])

  useEffect(()=>{
    if (apiBase){
      // notify main to forward console logs
      if (window.__client_log_send) window.__client_log_send(apiBase)
      // check readiness periodically
      let mounted = true
      async function poll(){
        try{
          const r = await fetch(`${apiBase}/health`)
          if (r.ok){
            const j = await r.json()
            if (mounted && j.ready) setBackendReady(true)
          }
        }catch(e){/* ignore */}
        if (!backendReady) setTimeout(poll, 2000)
      }
      poll()
      return ()=>{ mounted=false }
    }
  },[apiBase])

  useEffect(()=>{
    if (backendReady) fetchPersons()
  },[backendReady, apiBase])

  // Listen for person list updates and refresh
  useEffect(()=>{
    function onPersonListUpdate(){
      console.log('[App] Persons list update event received, refreshing...')
      fetchPersons()
    }
    window.addEventListener('person-list-updated', onPersonListUpdate)
    return ()=> window.removeEventListener('person-list-updated', onPersonListUpdate)
  },[])

  return (
    <div className="min-h-screen font-inter p-6">
      <div className="container max-w-6xl mx-auto">
        <Navbar tab={tab} setTab={setTab} backendReady={backendReady} />
        <div className="mt-6">
          {tab==='register' && <Register apiBase={apiBase} onEnrolled={fetchPersons} />}
          {tab==='recognize' && <Recognize apiBase={apiBase} backendReady={backendReady} />}
          {tab==='dashboard' && <Dashboard apiBase={apiBase} persons={persons} refresh={fetchPersons} backendReady={backendReady} />}
          {tab==='attendance' && <Attendance apiBase={apiBase} persons={persons} backendReady={backendReady} />}
        </div>
      </div>
    </div>
  )
}
