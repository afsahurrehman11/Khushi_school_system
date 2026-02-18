import React, {useState} from 'react'

export default function Dashboard({apiBase, persons = [], refresh, backendReady}){
  const [editing, setEditing] = useState(null)
  const [editRole, setEditRole] = useState('student')
  const [editHourlyRate, setEditHourlyRate] = useState('15.00')
  const [loading, setLoading] = useState(false)

  async function deletePerson(student_id){
    if (!confirm('Delete this person?')) return
    if (!apiBase){ alert('Backend not detected'); return }
    setLoading(true)
    try{
      const r = await fetch(`${apiBase}/persons/${student_id}`, {method:'DELETE', headers:{'x-api-key':'changeme'}})
      if (r.ok) await refresh()
      else alert('Delete failed')
    }catch(e){ alert('Delete failed: '+e.message) }
    setLoading(false)
  }

  function openEdit(p){
    setEditing(p)
    setEditRole(p.role || 'student')
    setEditHourlyRate(p.hourly_rate || '15.00')
  }

  async function submitEdit(e){
    e.preventDefault()
    if (!editing) return
    const fd = new FormData(e.target)
    // Add role
    fd.append('role', editRole)
    // Add hourly_rate only for teachers
    if (editRole === 'teacher') {
      fd.append('hourly_rate', parseFloat(editHourlyRate) || 15.0)
    }
    setLoading(true)
    try{
          if (!apiBase){ alert('Backend not detected'); setLoading(false); return }
          const r = await fetch(`${apiBase}/persons/${editing.student_id}`, {method:'PUT', body: fd, headers: {'x-api-key':'changeme'}})
      const j = await r.json()
      if (r.ok){
        // refresh persons list and notify other components
        setEditing(null)
        await refresh()
        try{ window.dispatchEvent(new CustomEvent('person-list-updated')) }catch(e){}
      } else {
        console.error('Update failed response:', j)
        alert(j.error || 'Update failed')
      }
    }catch(e){ console.error('Update failed exception:', e); alert('Update failed: '+e.message) }
    setLoading(false)
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Registered People</h2>
        <div className="text-sm text-slate-500">Backend: {backendReady ? 'ready' : 'not ready'}</div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-sm text-slate-500 border-b">
              <th className="py-2">Photo</th>
              <th className="py-2">Name</th>
              <th className="py-2">ID</th>
              <th className="py-2">Phone(s)</th>
              <th className="py-2">Role</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {persons.length===0 && (
              <tr><td colSpan="5" className="py-6 text-sm text-slate-500">No people registered yet.</td></tr>
            )}
            {persons.map(p=> (
              <tr key={p.student_id} className="border-b hover:bg-slate-50">
                <td className="py-3 w-28">
                  {p.image ? <img src={`${apiBase}/images/${p.image}`} alt="photo" className="w-16 h-16 object-cover rounded-md" /> : <div className="w-16 h-16 bg-slate-100 rounded-md" />}
                </td>
                <td className="py-3">{p.name}</td>
                <td className="py-3">{p.student_id}</td>
                <td className="py-3 text-sm text-slate-500">
                  {p.phone || '-'}
                  {p.principal_phone ? <div className="text-xs text-slate-400 mt-1">Principal: {p.principal_phone}</div> : null}
                </td>
                <td className="py-3">
                  <span className={`px-2 py-1 rounded-md text-xs ${p.role === 'teacher' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {p.role || 'student'}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button onClick={()=>openEdit(p)} className="px-3 py-1 rounded-md bg-white border text-sm">Edit</button>
                    <button onClick={()=>deletePerson(p.student_id)} className="px-3 py-1 rounded-md bg-red-600 text-white text-sm" disabled={loading}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="font-semibold">Edit person</h3>
            <form onSubmit={submitEdit} className="space-y-3 mt-3">
              <div>
                <label className="text-sm text-slate-700">Name</label>
                <input name="name" defaultValue={editing.name} className="mt-1 block w-full rounded-md border-gray-200 p-2" />
              </div>
              <div>
                <label className="text-sm text-slate-700">Student / Employee ID</label>
                <input name="new_student_id" defaultValue={editing.student_id} className="mt-1 block w-full rounded-md border-gray-200 p-2" />
              </div>
              <div>
                <label className="text-sm text-slate-700">Phone</label>
                <input name="phone" defaultValue={editing.phone || ''} className="mt-1 block w-full rounded-md border-gray-200 p-2" />
              </div>
              <div>
                <label className="text-sm text-slate-700">Principal phone</label>
                <input name="principal_phone" defaultValue={editing.principal_phone || ''} className="mt-1 block w-full rounded-md border-gray-200 p-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-700">Check-in time</label>
                  <input name="time_in" type="time" defaultValue={editing.time_in || ''} className="mt-1 block w-full rounded-md border-gray-200 p-2" />
                </div>
                <div>
                  <label className="text-sm text-slate-700">Check-out time</label>
                  <input name="time_out" type="time" defaultValue={editing.time_out || ''} className="mt-1 block w-full rounded-md border-gray-200 p-2" />
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-700">Role</label>
                <select name="role" value={editRole} onChange={(e)=>setEditRole(e.target.value)} className="mt-1 block w-full rounded-md border-gray-200 p-2">
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                </select>
              </div>
              {editRole === 'teacher' && (
                <div>
                  <label className="text-sm text-slate-700">Hourly rate</label>
                  <input name="hourly_rate" value={editHourlyRate} onChange={(e)=>setEditHourlyRate(e.target.value)} className="mt-1 block w-full rounded-md border-gray-200 p-2" />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={()=>setEditing(null)} className="px-3 py-1 rounded-md border">Cancel</button>
                <button type="submit" className="px-3 py-1 rounded-md bg-blue-600 text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
