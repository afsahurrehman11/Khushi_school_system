import React, {useState} from 'react'

export default function Register({apiBase, onEnrolled}){
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState(null)
  const [role, setRole] = useState('student')

  async function onSubmit(e){
    e.preventDefault()
    if (!apiBase){ setStatus('Backend not detected'); return }
    const fd = new FormData(e.target)
    
    // Remove hourly_rate if role is student
    if (role === 'student') {
      fd.delete('hourly_rate')
    }
    
    setStatus('Enrolling...')
    try{
      const resp = await fetch(`${apiBase}/enroll`, {method:'POST', body: fd, headers: {'x-api-key':'changeme'}})
      const j = await resp.json()
      if (resp.ok){
        setStatus(`Enrolled ${j.student_id}`)
        e.target.reset()
        setPreview(null)
        setRole('student')
        if (typeof onEnrolled === 'function') onEnrolled()
      } else {
        setStatus(`Error: ${j.error || JSON.stringify(j)}`)
      }
    }catch(err){ setStatus(`Error: ${err.message}`) }
  }

  function onFileChange(e){
    const f = e.target.files && e.target.files[0]
    if (!f) return setPreview(null)
    const url = URL.createObjectURL(f)
    setPreview(url)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Register Person</h2>
        <div className="text-sm text-slate-500">Add a new person to the system</div>
      </div>

      <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-3">
          <div>
            <label className="label">Name</label>
            <input name="name" required className="input" placeholder="Full name" />
          </div>
          <div>
            <label className="label">Student / Employee ID</label>
            <input name="student_id" required className="input" placeholder="e.g. 12345" />
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" value={role} onChange={(e)=>setRole(e.target.value)} className="input">
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Check-in time</label>
              <input name="time_in" type="time" className="input" />
            </div>
            <div>
              <label className="label">Check-out time</label>
              <input name="time_out" type="time" className="input" />
            </div>
          </div>

          <div>
            <label className="label">Phone</label>
            <input name="phone" type="tel" className="input" placeholder="e.g. +1234567890" />
          </div>
          <div>
            <label className="label">Principal phone</label>
            <input name="principal_phone" type="tel" className="input" placeholder="e.g. +10987654321" />
          </div>

          {role === 'teacher' && (
            <div>
              <label className="label">Hourly Rate (USD)</label>
              <input name="hourly_rate" type="number" step="0.01" defaultValue="15.00" className="input" placeholder="15.00" />
            </div>
          )}
          <div>
            <label className="label">Image</label>
            <input type="file" name="file" accept="image/*" required onChange={onFileChange} className="mt-1" />
          </div>
          <div className="flex gap-3 mt-2">
            <button type="submit" className="btn" disabled={!apiBase}>Enroll</button>
            <button type="button" onClick={()=>{document.querySelector('form').reset(); setPreview(null); setStatus('')}} className="btn-ghost">Clear</button>
          </div>
          <div className="mt-2 text-sm text-slate-600">{status}</div>
        </div>

        <div className="md:col-span-1">
          <div className="text-sm text-slate-500 mb-2">Preview</div>
          <div className="w-full h-48 bg-slate-50 rounded-md flex items-center justify-center overflow-hidden">
            {preview ? <img src={preview} alt="preview" className="object-cover w-full h-full"/> : <div className="text-sm text-slate-400">No image selected</div>}
          </div>
        </div>
      </form>
    </div>
  )
}
