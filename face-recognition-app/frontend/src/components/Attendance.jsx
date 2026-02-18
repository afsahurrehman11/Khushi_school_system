import React, {useState, useEffect} from 'react'

export default function Attendance({apiBase, persons, backendReady}){
  const [attendance, setAttendance] = useState([])
  const [payroll, setPayroll] = useState(null)
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [view, setView] = useState('attendance') // 'attendance' or 'payroll'
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const teachers = persons.filter(p => p.role === 'teacher')

  async function fetchAttendance(){
    if (!apiBase) {
      console.warn('[Attendance] apiBase not available')
      return
    }
    setLoading(true)
    try{
      const params = new URLSearchParams()
      if (selectedTeacher) params.append('student_id', selectedTeacher)
      if (startDate) params.append('date', startDate)
      params.append('role', 'teacher')
      
      const url = `${apiBase}/attendance?${params}`
      console.log('[Attendance] Fetching from:', url)
      const r = await fetch(url)
      console.log('[Attendance] Response status:', r.status)
      if (r.ok){
        const j = await r.json()
        console.log('[Attendance] Received records:', j.records)
        setAttendance(j.records || [])
      } else {
        console.error('[Attendance] API returned error:', r.status)
      }
    }catch(e){
      console.error('[Attendance] Failed to fetch attendance:', e)
    }
    setLoading(false)
  }

  async function fetchPayroll(){
    if (!apiBase || !selectedTeacher) return
    setLoading(true)
    try{
      const params = new URLSearchParams()
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)
      
      const r = await fetch(`${apiBase}/payroll/${selectedTeacher}?${params}`)
      if (r.ok){
        const j = await r.json()
        setPayroll(j)
      }
    }catch(e){
      console.error('Failed to fetch payroll:', e)
    }
    setLoading(false)
  }

  useEffect(()=>{
    // Load attendance data when component mounts or view changes
    if (backendReady && view === 'attendance') {
      console.log('[Attendance] Loading attendance data on useEffect...')
      fetchAttendance()
    }
  },[backendReady, selectedTeacher, startDate, view])

  useEffect(()=>{
    // Trigger payroll fetch when switching to payroll view
    if (backendReady && view === 'payroll' && selectedTeacher) {
      console.log('[Attendance] Loading payroll on useEffect...')
      fetchPayroll()
    }
  },[backendReady, selectedTeacher, startDate, endDate, view])

  // Auto-refresh attendance every 5 seconds when enabled
  useEffect(()=>{
    if (!autoRefresh || view !== 'attendance') return
    const interval = setInterval(()=>{
      if (backendReady) fetchAttendance()
    }, 5000)
    return ()=> clearInterval(interval)
  },[autoRefresh, view, backendReady, selectedTeacher, startDate])

  // Listen for recognition events and refresh immediately
  useEffect(()=>{
    function onUpdate(e){
      console.log('[Attendance] Received event:', e.type)
      if (view === 'attendance') {
        console.log('[Attendance] Fetching attendance records...')
        fetchAttendance()
      }
    }
    window.addEventListener('attendance-updated', onUpdate)
    return ()=> window.removeEventListener('attendance-updated', onUpdate)
  },[view, backendReady, selectedTeacher, startDate])

  function formatTime(isoString){
    if (!isoString) return '-'
    try{
      return new Date(isoString).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
    }catch{
      return isoString
    }
  }

  function getStatusDisplay(record){
    // Show time-based status if available (present/late present)
    if (record.status === 'present'){
      return <span className="px-2 py-1 rounded-md text-xs bg-green-100 text-green-700 font-medium">Present</span>
    }
    if (record.status === 'late present'){
      return <span className="px-2 py-1 rounded-md text-xs bg-amber-100 text-amber-700 font-medium">Late Present</span>
    }
    // Fallback to clock in/out status
    if (record.time_out){
      return <span className="px-2 py-1 rounded-md text-xs bg-blue-100 text-blue-700">Complete</span>
    }
    return <span className="px-2 py-1 rounded-md text-xs bg-amber-100 text-amber-700">Active</span>
  }

  function calculateHours(timeIn, timeOut){
    if (!timeIn || !timeOut) return '-'
    try{
      const t1 = new Date(timeIn)
      const t2 = new Date(timeOut)
      const hours = (t2 - t1) / (1000 * 60 * 60)
      return hours.toFixed(2) + ' hrs'
    }catch{
      return '-'
    }
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Teacher Attendance & Payroll</h2>
        <div className="flex gap-2 items-center">
          {view === 'attendance' && (
            <>
              <button onClick={fetchAttendance} className="px-3 py-1 rounded-md text-sm border hover:bg-gray-50" title="Refresh now">🔄 Refresh</button>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={autoRefresh} onChange={(e)=>setAutoRefresh(e.target.checked)} className="rounded" />
                Auto-refresh
              </label>
            </>
          )}
          <button onClick={()=>setView('attendance')} className={`px-3 py-1 rounded-md text-sm ${view==='attendance' ? 'bg-blue-600 text-white' : 'border'}`}>Attendance</button>
          <button onClick={()=>setView('payroll')} className={`px-3 py-1 rounded-md text-sm ${view==='payroll' ? 'bg-blue-600 text-white' : 'border'}`}>Payroll</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-sm text-slate-700">Teacher</label>
          <select value={selectedTeacher} onChange={(e)=>setSelectedTeacher(e.target.value)} className="mt-1 block w-full rounded-md border-gray-200 p-2">
            <option value="">All Teachers</option>
            {teachers.map(t => (
              <option key={t.student_id} value={t.student_id}>{t.name} ({t.student_id})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-slate-700">Start Date</label>
          <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="mt-1 block w-full rounded-md border-gray-200 p-2" />
        </div>
        {view === 'payroll' && (
          <div>
            <label className="text-sm text-slate-700">End Date</label>
            <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="mt-1 block w-full rounded-md border-gray-200 p-2" />
          </div>
        )}
      </div>

      {view === 'attendance' ? (
        <div>
          {attendance.length === 0 && !loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="font-semibold text-blue-900 mb-1">📋 How Attendance Works</div>
              <div className="text-sm text-blue-700">
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Go to <strong>Recognize</strong> tab</li>
                  <li>Point camera at a <strong>teacher</strong></li>
                  <li><strong>First recognition</strong> → Automatically clocks IN</li>
                  <li><strong>Second recognition</strong> (same day) → Automatically clocks OUT</li>
                  <li>Return here to view attendance records and calculate payroll</li>
                </ol>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-sm text-slate-500 border-b">
                  <th className="py-2">Date</th>
                  <th className="py-2">Teacher</th>
                  <th className="py-2">ID</th>
                  <th className="py-2">Time In</th>
                  <th className="py-2">Time Out</th>
                  <th className="py-2">Hours</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan="7" className="py-6 text-center text-sm text-slate-500">Loading...</td></tr>
                )}
                {!loading && attendance.length===0 && (
                  <tr><td colSpan="7" className="py-6 text-center text-sm text-slate-500">No attendance records found.</td></tr>
                )}
                {!loading && attendance.map((a, i) => (
                  <tr key={i} className="border-b hover:bg-slate-50">
                    <td className="py-3">{a.date}</td>
                    <td className="py-3">{a.name}</td>
                    <td className="py-3">{a.student_id}</td>
                    <td className="py-3">{formatTime(a.time_in)}</td>
                    <td className="py-3">{formatTime(a.time_out)}</td>
                    <td className="py-3">{calculateHours(a.time_in, a.time_out)}</td>
                    <td className="py-3">
                      {getStatusDisplay(a)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          {!selectedTeacher ? (
            <div className="text-center py-12 text-sm text-slate-500">
              Please select a teacher to view payroll
            </div>
          ) : loading ? (
            <div className="text-center py-12 text-sm text-slate-500">Loading payroll...</div>
          ) : payroll ? (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-xs text-blue-600 font-semibold">Total Hours</div>
                  <div className="text-2xl font-bold text-blue-900 mt-1">{payroll.total_hours}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-xs text-green-600 font-semibold">Total Days</div>
                  <div className="text-2xl font-bold text-green-900 mt-1">{payroll.total_days}</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-xs text-purple-600 font-semibold">Hourly Rate</div>
                  <div className="text-2xl font-bold text-purple-900 mt-1">${payroll.hourly_rate}</div>
                </div>
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <div className="text-xs text-emerald-600 font-semibold">Total Salary</div>
                  <div className="text-2xl font-bold text-emerald-900 mt-1">${payroll.total_salary}</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-sm text-slate-500 border-b">
                      <th className="py-2">Date</th>
                      <th className="py-2">Time In</th>
                      <th className="py-2">Time Out</th>
                      <th className="py-2">Hours</th>
                      <th className="py-2">Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payroll.records.map((r, i) => (
                      <tr key={i} className="border-b hover:bg-slate-50">
                        <td className="py-3">{r.date}</td>
                        <td className="py-3">{formatTime(r.time_in)}</td>
                        <td className="py-3">{formatTime(r.time_out)}</td>
                        <td className="py-3">{r.hours_worked} hrs</td>
                        <td className="py-3 font-semibold">${(r.hours_worked * payroll.hourly_rate).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
