import React from 'react'

export default function Navbar({tab, setTab, backendReady}){
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Face Identity Module</h1>
        <p className="text-sm text-slate-500">Manage, enroll and recognize people</p>
      </div>
      <nav className="flex items-center gap-2">
        <button onClick={()=>setTab('dashboard')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab==='dashboard' ? 'bg-white border border-slate-200 shadow-sm text-slate-900' : 'text-slate-700'}`}>Dashboard</button>
        <button onClick={()=>setTab('register')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab==='register' ? 'bg-white border border-slate-200 shadow-sm text-slate-900' : 'text-slate-700'}`}>Register</button>
        <button onClick={()=>setTab('recognize')} disabled={!backendReady} className={`px-4 py-2 rounded-md text-sm font-medium ${tab==='recognize' ? 'bg-blue-600 text-white' : 'text-slate-700'} ${!backendReady ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}>Recognize</button>
        <button onClick={()=>setTab('attendance')} className={`px-4 py-2 rounded-md text-sm font-medium ${tab==='attendance' ? 'bg-white border border-slate-200 shadow-sm text-slate-900' : 'text-slate-700'}`}>Attendance</button>
      </nav>
    </header>
  )
}
