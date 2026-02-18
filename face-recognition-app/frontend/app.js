const API_BASE = window.location.origin.replace(/:\d+$/, ':8000'); // assume backend runs on 8000

// backend readiness gating
let BACKEND_READY = false;
const tabRecognizeBtn = document.getElementById('tab-recognize');
tabRecognizeBtn.disabled = true; // locked until backend reports ready

document.getElementById('tab-register').addEventListener('click', () => showTab('register'));
document.getElementById('tab-recognize').addEventListener('click', () => showTab('recognize'));

function showTab(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  // prevent access to live detector until backend ready
  if (name === 'recognize' && !BACKEND_READY) {
    const status = document.getElementById('stabilityStatus');
    if (status) status.textContent = 'Waiting for backend readiness — please wait...';
    return;
  }
  document.getElementById(name).classList.remove('hidden');
}

// Enroll form
const enrollForm = document.getElementById('enrollForm');
enrollForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(enrollForm);
  const resEl = document.getElementById('enrollResult');
  resEl.textContent = 'Enrolling...';
  try {
    const resp = await fetch(`${API_BASE}/enroll`, { method: 'POST', body: form });
    const j = await resp.json();
    if (resp.ok) resEl.textContent = `Enrolled ${j.student_id}`;
    else resEl.textContent = `Error: ${j.error || JSON.stringify(j)}`;
  } catch (err) {
    resEl.textContent = `Error: ${err.message}`;
  }
});

// Recognize: camera capture + client-side stabilization (BlazeFace)
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const canvas = document.getElementById('capture');
const ctx = canvas.getContext('2d');
const captureBtn = document.getElementById('captureBtn');
const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('stabilityStatus');

let model = null;
let detecting = false;
let stableCount = 0;
let lastBox = null;
const STABLE_REQUIRED = 6; // consecutive frames
const BOX_DRIFT_THRESH = 30; // pixels

async function loadDetector() {
  statusEl.textContent = 'Loading detector...';
  try {
    model = await blazeface.load();
    statusEl.textContent = 'Detector loaded.';
  } catch (e) {
    statusEl.textContent = 'Detector load failed, fallback to manual capture.';
    console.warn('BlazeFace load failed', e);
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    video.addEventListener('loadeddata', () => {
      overlay.width = video.videoWidth || 320;
      overlay.height = video.videoHeight || 240;
      canvas.width = overlay.width;
      canvas.height = overlay.height;
      runDetectionLoop();
    });
  } catch (e) {
    console.warn('Camera not available', e);
    statusEl.textContent = 'Camera not available — use file upload.';
  }
}

async function runDetectionLoop() {
  if (!model) return;
  detecting = true;
  while (detecting) {
    try {
      const returnTensors = false;
      const predictions = await model.estimateFaces(video, returnTensors);
      octx.clearRect(0, 0, overlay.width, overlay.height);
      if (predictions && predictions.length > 0) {
        // pick highest probability
        const p = predictions[0];
        const [x, y, w, h] = p.topLeft && p.bottomRight ? [p.topLeft[0], p.topLeft[1], p.bottomRight[0]-p.topLeft[0], p.bottomRight[1]-p.topLeft[1]] : [p.boundingBox.topLeft[0], p.boundingBox.topLeft[1], p.boundingBox.bottomRight[0]-p.boundingBox.topLeft[0], p.boundingBox.bottomRight[1]-p.boundingBox.topLeft[1]];
        // draw box
        octx.strokeStyle = '#22c55e';
        octx.lineWidth = 2;
        octx.strokeRect(x, y, w, h);

        const center = { x: x + w/2, y: y + h/2 };
        if (lastBox) {
          const dx = Math.hypot(center.x - lastBox.x, center.y - lastBox.y);
          if (dx < BOX_DRIFT_THRESH) {
            stableCount += 1;
          } else {
            stableCount = 0;
          }
        } else {
          stableCount = 1;
        }
        lastBox = center;
        statusEl.textContent = `Face detected — stable ${stableCount}/${STABLE_REQUIRED}`;
        if (stableCount >= STABLE_REQUIRED) {
          captureBtn.disabled = false;
          statusEl.textContent = 'Face stabilized — ready to capture';
        } else {
          captureBtn.disabled = true;
        }
      } else {
        stableCount = 0;
        lastBox = null;
        statusEl.textContent = 'No face detected';
        captureBtn.disabled = true;
      }
    } catch (e) {
      console.warn('detection error', e);
    }
    await new Promise(r => setTimeout(r, 100));
  }
}

captureBtn.addEventListener('click', async () => {
  // if file chosen, prefer that
  const file = fileInput.files[0];
  if (file) return sendFile(file);
  // capture frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(async (blob) => {
    await sendFile(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
  }, 'image/jpeg', 0.9);
});

async function sendFile(file) {
  const resEl = document.getElementById('recognizeResult');
  resEl.textContent = 'Recognizing...';
  const form = new FormData();
  form.append('file', file);
  try {
    const resp = await fetch(`${API_BASE}/recognize`, { method: 'POST', body: form });
    const j = await resp.json();
    showResult(j, file);
  } catch (err) {
    resEl.textContent = `Error: ${err.message}`;
  }
}

function showResult(j, file){
  const resEl = document.getElementById('recognizeResult');
  const info = document.getElementById('infoCard');
  const personPhoto = document.getElementById('personPhoto');
  const personName = document.getElementById('personName');
  const personId = document.getElementById('personId');
  const personConfidence = document.getElementById('personConfidence');
  const guidance = document.getElementById('guidance');

  // compute heuristics from file (brightness, face size, angle)
  computeHeuristics(file).then((h) => {
    let guideMsgs = [];
    if (h.brightness < 60) guideMsgs.push('Move to brighter light');
    if (h.boxRatio < 0.15) guideMsgs.push('Move closer');
    if (h.boxRatio > 0.6) guideMsgs.push('Move a bit farther');
    if (Math.abs(h.eyeSlope) > 0.25) guideMsgs.push('Face angle detected — look straight');
    if (guideMsgs.length === 0) guideMsgs.push('Good capture');
    guidance.innerHTML = guideMsgs.map(m=>`<div>${m}</div>`).join('');

    // show card
    if (j.match) {
      personPhoto.src = URL.createObjectURL(file);
      personName.textContent = j.match.name;
      personId.textContent = j.match.student_id;
      personConfidence.textContent = `Confidence: ${j.confidence.toFixed(3)}`;
    } else {
      personPhoto.src = URL.createObjectURL(file);
      personName.textContent = 'Unknown';
      personId.textContent = '';
      personConfidence.textContent = `Best score: ${j.confidence.toFixed(3)}`;
    }
    info.classList.remove('hidden');
    resEl.textContent = '';
  }).catch(err=>{
    resEl.textContent = 'Could not compute heuristics';
  })
}

async function computeHeuristics(file){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = async () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d');
      cx.drawImage(img,0,0);
      const data = cx.getImageData(0,0,c.width,c.height).data;
      // brightness average
      let sum=0; let count=0;
      for(let i=0;i<data.length;i+=4){ sum += (data[i]+data[i+1]+data[i+2])/3; count++; }
      const brightness = sum/count;
      // try to detect face via blazeface on an offscreen video element using model
      let boxRatio = 0;
      let eyeSlope = 0;
      try{
        if (model){
          // create tensor from canvas
          const tfimg = tf.browser.fromPixels(c);
          const predictions = await model.estimateFaces(tfimg, false);
          tfimg.dispose();
          if (predictions && predictions.length>0){
            const p = predictions[0];
            const w = (p.bottomRight[0]-p.topLeft[0]);
            boxRatio = w / c.width;
            if (p.landmarks && p.landmarks.length>=2){
              const leftEye = p.landmarks[0];
              const rightEye = p.landmarks[1];
              eyeSlope = (rightEye[1]-leftEye[1])/(rightEye[0]-leftEye[0]+0.0001);
            }
          }
        }
      }catch(e){ console.warn('heuristics failed', e); }
      resolve({brightness, boxRatio, eyeSlope});
    }
    img.onerror = (e)=>reject(e);
    img.src = URL.createObjectURL(file);
  })
}

document.getElementById('retryBtn').addEventListener('click', ()=>{
  document.getElementById('infoCard').classList.add('hidden');
  document.getElementById('recognizeResult').textContent = '';
});

document.getElementById('confirmBtn').addEventListener('click', ()=>{
  const resEl = document.getElementById('recognizeResult');
  resEl.textContent = 'Confirmed.';
});

// Poll backend /health until ready. When ready, enable the Recognize tab and allow live detector access.
async function pollBackendReady(intervalMs = 3000) {
  const status = document.getElementById('stabilityStatus');
  try {
    const resp = await fetch(`${API_BASE}/health`);
    if (resp.ok) {
      const j = await resp.json();
      if (j.ready) {
        if (status) status.textContent = 'Backend ready — loading detector...';
        // start loading detector & camera now that backend is ready
        await loadDetector();
        await startCamera();
        BACKEND_READY = true;
        tabRecognizeBtn.disabled = false;
        if (status) status.textContent = 'Detector and backend ready';
        return;
      } else {
        if (status) status.textContent = 'Waiting for backend readiness...';
      }
    } else {
      if (status) status.textContent = 'Backend unreachable';
    }
  } catch (e) {
    if (status) status.textContent = 'Backend unreachable';
  }
  setTimeout(()=>pollBackendReady(intervalMs), intervalMs);
}

pollBackendReady();
