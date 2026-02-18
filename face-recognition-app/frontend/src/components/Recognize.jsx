import React, {useRef, useState, useEffect} from 'react'

export default function Recognize({apiBase, backendReady}){
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const lastBoxRef = useRef(null)
  const [status, setStatus] = useState('Waiting for backend...')
  const [result, setResult] = useState(null)
  const [model, setModel] = useState(null)
  const [detecting, setDetecting] = useState(false)
  const detectRef = useRef(false)

  // detection params
  const STABLE_REQUIRED = 6
  const BOX_DRIFT_THRESH = 30
  const stableCount = useRef(0)
  const lastCenter = useRef(null)
  const predsCount = useRef(0)

  useEffect(()=>{
    if (!backendReady) return
    setStatus('Initializing camera...')
    async function start(){
      try{
        const s = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}})
        if (videoRef.current) videoRef.current.srcObject = s
        setStatus('Camera ready — loading detector')
        // load blazeface if available
        try{
          if (window.blazeface){
            const m = await window.blazeface.load()
            setModel(m)
            setStatus('Detector loaded — looking for faces')
            startDetectionLoop(m)
          } else {
            setStatus('Detector not available — use capture button')
          }
        }catch(e){
          console.warn('Detector load failed', e)
          setStatus('Detector failed — use capture')
        }
      }catch(e){ setStatus('Camera unavailable — use file upload') }
    }
    start()
    return ()=>{ stopDetection() }
  },[backendReady])

  function stopDetection(){
    setDetecting(false)
    stableCount.current = 0
    lastCenter.current = null
  }

  async function startDetectionLoop(m){
    if (!m || !videoRef.current) return
    if (!m || !videoRef.current) return
    if (detectRef.current) return
    detectRef.current = true
    setDetecting(true)
    const video = videoRef.current
    const overlay = overlayRef.current
    const octx = overlay && overlay.getContext ? overlay.getContext('2d') : null
    // ensure sizes and style to match display
    const resizeOverlay = ()=>{
      if (!video || !overlay) return
      overlay.width = video.videoWidth || overlay.width
      overlay.height = video.videoHeight || overlay.height
      overlay.style.width = video.clientWidth + 'px'
      overlay.style.height = video.clientHeight + 'px'
    }

    video.addEventListener('loadeddata', resizeOverlay)
    resizeOverlay()

    while(detectRef.current){
      if (!video || video.readyState < 2) { await new Promise(r=>setTimeout(r,200)); continue }
      try{
        const preds = await m.estimateFaces(video, false)
        if (octx){ octx.clearRect(0,0,overlay.width, overlay.height) }
        if (preds && preds.length>0){
          predsCount.current = preds.length
          // if multiple faces, draw all in red and prompt the user
          if (preds.length > 1){
            stableCount.current = 0
            lastCenter.current = null
            setStatus('Only 1 face allowed — please ensure only one person is visible')
            if (octx){
              octx.strokeStyle = '#ef4444'; octx.lineWidth = 3
              for (let i=0;i<preds.length;i++){
                const pi = preds[i]
                const tl = pi.topLeft || (pi.boundingBox && pi.boundingBox.topLeft)
                const br = pi.bottomRight || (pi.boundingBox && pi.boundingBox.bottomRight)
                if (tl && br){ const x = tl[0], y = tl[1], w = br[0]-tl[0], h = br[1]-tl[1]; octx.strokeRect(x,y,w,h) }
              }
            }
          } else {
            const p = preds[0]
            const tl = p.topLeft || (p.boundingBox && p.boundingBox.topLeft)
            const br = p.bottomRight || (p.boundingBox && p.boundingBox.bottomRight)
            if (tl && br){
              const x = tl[0], y = tl[1], w = br[0]-tl[0], h = br[1]-tl[1]
              const center = {x: x + w/2, y: y + h/2}
              // update stability
              if (lastCenter.current){
                const dx = Math.hypot(center.x-lastCenter.current.x, center.y-lastCenter.current.y)
                if (dx < BOX_DRIFT_THRESH) stableCount.current += 1
                else stableCount.current = 0
              } else {
                stableCount.current = 1
              }
              lastCenter.current = center
              // store last box for cropping on capture
              lastBoxRef.current = { x, y, w, h }
              const boxRatio = w / (overlay?.width || video.videoWidth || 1)
              // instructions
              const inst = []
              if (boxRatio < 0.15) inst.push('Move closer')
              if (boxRatio > 0.6) inst.push('Move a bit farther')
              if (stableCount.current < STABLE_REQUIRED) inst.push(`Hold still (${stableCount.current}/${STABLE_REQUIRED})`)
              setStatus(inst.join(' • '))
              // draw box: green when stable, red otherwise
              const stable = stableCount.current >= STABLE_REQUIRED
              if (octx){ octx.strokeStyle = stable ? '#16a34a' : '#ef4444'; octx.lineWidth = Math.max(2, Math.min(6, Math.round((w+ h)/200))); octx.strokeRect(x,y,w,h) }
              if (stable){ setStatus('Face stabilized — ready to capture') }
            }
          }
        } else {
          stableCount.current = 0
          lastCenter.current = null
          if (octx){ octx.clearRect(0,0,overlay.width, overlay.height) }
          setStatus('No face detected — position face in frame')
        }
      }catch(e){ console.warn('detection err', e); setStatus('Detection error') }
      await new Promise(r=>setTimeout(r,100))
    }
    // cleanup when stopped
    if (overlay && overlay.getContext){ const c = overlay.getContext('2d'); c && c.clearRect(0,0,overlay.width, overlay.height) }
    setDetecting(false)
  }

  async function captureAndSend(){
    setStatus('Capturing...')
    stopDetection()
    const video = videoRef.current
    if (!video) return
    const w = video.videoWidth || 640
    const h = video.videoHeight || 480
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    // if we have a recent detected box, crop around it with padding to send larger area
    const box = lastBoxRef.current
    if (box && typeof box.x === 'number'){
      const pad = 0.7  // Large padding (70%) for maximum context
      const sx = Math.max(0, Math.floor(box.x - (box.w * pad) / 2))
      const sy = Math.max(0, Math.floor(box.y - (box.h * pad) / 2))
      const sw = Math.min(w - sx, Math.floor(box.w * (1 + pad)))
      const sh = Math.min(h - sy, Math.floor(box.h * (1 + pad)))
      c.width = sw; c.height = sh
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
    } else {
      c.width = w; c.height = h
      ctx.drawImage(video,0,0,w,h)
    }
    c.toBlob(async (blob)=>{
      const fd = new FormData()
      fd.append('file', new File([blob],'capture.jpg',{type:'image/jpeg'}))
      fd.append('auto_clock', 'true')  // Enable auto clock-in/out for teachers
      try{
        // block capture if multiple faces currently detected
        if (predsCount.current && predsCount.current > 1){ setStatus('Only 1 face allowed — capture blocked'); return }
        if (!apiBase){ setStatus('Backend not detected'); return }
        setStatus('Recognizing...')
        const resp = await fetch(`${apiBase}/recognize`, {method:'POST', body: fd, headers:{'x-api-key':'changeme'}})
        const j = await resp.json()
        // if matched, fetch registry entry to get original image
        if (j.match){
          try{
            const personsResp = await fetch(`${apiBase}/persons`)
            if (personsResp.ok){
              const list = await personsResp.json()
              const found = list.find(x=>x.student_id===j.match.student_id)
              if (found) j.match.image = found.image
            }
          }catch(e){/* ignore */}
          // Also fetch top matches for debugging
          console.log('Recognition result:', j)
        } else {
          console.log('No match found. Best confidence:', j.confidence)
        }
        setResult(j)
        // Log for debugging and notify other components
        if (j.attendance_action) {
          console.log('[Recognize] Clock action:', j.attendance_action, 'for', j.match?.name)
          try{ 
            window.dispatchEvent(new CustomEvent('attendance-updated', { detail: { student_id: j.match && j.match.student_id } })) 
            window.dispatchEvent(new CustomEvent('person-list-updated'))
          }catch(e){ console.error('[Recognize] Error dispatching event:', e) }
        }
        setStatus('Done')
      }catch(err){ setStatus('Error: '+err.message) }
    }, 'image/jpeg', 0.9)
  }

  async function onFile(e){
    const f = e.target.files[0]
    if (!f) return
    setStatus('Recognizing file...')
    const fd = new FormData(); 
    fd.append('file', f)
    fd.append('auto_clock', 'true')  // Enable auto clock-in/out for teachers
    try{
      if (!apiBase){ setStatus('Backend not detected'); return }
      const resp = await fetch(`${apiBase}/recognize`, {method:'POST', body: fd, headers:{'x-api-key':'changeme'}})
      const j = await resp.json();
      if (j.match){
        const personsResp = await fetch(`${apiBase}/persons`)
        if (personsResp.ok){ const list = await personsResp.json(); const found = list.find(x=>x.student_id===j.match.student_id); if (found) j.match.image = found.image }
      }
      setResult(j); setStatus('Done')
      // Log for debugging and notify other components
      if (j.attendance_action) {
        console.log('[Recognize] Clock action:', j.attendance_action, 'for', j.match?.name)
        try{ 
          window.dispatchEvent(new CustomEvent('attendance-updated', { detail: { student_id: j.match && j.match.student_id } })) 
          window.dispatchEvent(new CustomEvent('person-list-updated'))
        }catch(e){ console.error('[Recognize] Error dispatching event:', e) }
      }
    }catch(err){ setStatus('Error: '+err.message) }
  }

  function retry(){
    setResult(null)
    setStatus('Resuming detection...')
    stableCount.current = 0
    lastCenter.current = null
    setDetecting(true)
    if (model) startDetectionLoop(model)
  }

  const statusDot = status.startsWith('Error') ? 'bg-red-500' : status.includes('No face') || status.includes('Detector failed') ? 'bg-yellow-400' : status==='Done' ? 'bg-green-500' : 'bg-slate-300'

  return (
    <div className="card">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Live Capture</h3>
            <div className="flex items-center gap-3">
              <div className="badge">
                <span className={`dot ${statusDot}`}></span>
                <span className="text-sm text-slate-600">{status}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 relative video-wrap" style={{aspectRatio:'4/3'}}>
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <canvas ref={overlayRef} className="absolute left-0 top-0 pointer-events-none" />
          </div>

          <div className="mt-3 flex gap-3 items-center">
            <button onClick={captureAndSend} className="btn" disabled={!model} title={!model? 'Loading detector...' : 'Capture and send'}>Capture & Recognize</button>
            <input type="file" accept="image/*" onChange={onFile} className="text-sm text-slate-500" />
            {result && <button onClick={retry} className="btn-ghost">Retry</button>}
          </div>
        </div>

        <aside>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="font-semibold text-blue-900 mb-3">⏰ Attendance Time Rules</div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 pt-0.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
                </div>
                <div className="text-sm text-blue-800">
                  <strong>Present:</strong> Arrival before 8:00 AM
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 pt-0.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-amber-500"></span>
                </div>
                <div className="text-sm text-blue-800">
                  <strong>Late Present:</strong> Arrival at 8:00 AM or later
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-blue-700 bg-white rounded p-2">
              Current time marking will be applied when you clock in.
            </div>
          </div>

          <div className="result-card">
            <h4 className="font-semibold">Result</h4>
            {result ? (
              result.match ? (
                <div className="mt-3">
                  <div className="flex items-center gap-4">
                    {result.match.image ? <img src={`${apiBase}/images/${result.match.image}`} alt="person" className="w-20 h-20 object-cover rounded-md" /> : <div className="w-20 h-20 bg-slate-100 rounded-md" />}
                    <div>
                      <div className="text-lg font-semibold text-green-600">{result.match.name}</div>
                      <div className="text-sm text-slate-500">{result.match.student_id} • {result.match.role || 'student'}</div>
                      <div className="mt-2 text-sm">Score: <strong className="text-green-600">{result.confidence.toFixed(3)}</strong></div>
                      {result.confidence < 0.40 && <div className="text-xs text-amber-600 mt-1">⚠ Low confidence - verify match</div>}
                    </div>
                  </div>
                  {result.attendance_action && (
                    <div className={`mt-3 p-3 rounded-md text-sm ${result.attendance_action === 'clocked_in' ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'}`}>
                      <div className="font-semibold">{result.attendance_action === 'clocked_in' ? '⏰ Clocked In' : '✓ Clocked Out'}</div>
                      <div className="text-xs mt-1">{new Date(result.time).toLocaleString()}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <div className="text-sm font-semibold text-red-600">Unknown Person</div>
                  <div className="text-xs text-slate-600 mt-1">Best score: <strong>{result.confidence.toFixed(3)}</strong></div>
                  <div className="text-xs text-slate-500 mt-2">Try: better lighting, clearer photo, or re-enroll</div>
                </div>
              )
            ) : (
              <div className="mt-3 text-sm text-slate-500">No result yet</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
