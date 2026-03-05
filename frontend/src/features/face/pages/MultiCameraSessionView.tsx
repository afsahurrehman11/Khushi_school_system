import React, { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import logger from '../../../utils/logger';
import { audioFeedback } from '../../../utils/audioFeedback';

// Simple single-session view that accepts deviceId and name via query params
const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

const MATCH_THRESHOLD = 0.90;
const SUCCESS_DISPLAY_DURATION = 5000;

const MultiCameraSessionView: React.FC = () => {
  const query = useQuery();
  const deviceId = query.get('deviceId') || '';
  const name = query.get('name') || 'Camera';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [resultText, setResultText] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(0);
  const [audioEnabled, setAudioEnabled] = useState(true);

  useEffect(() => {
    const start = async () => {
      if (!deviceId) {
        setStatus('failed');
        setResultText('No device specified');
        return;
      }

      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
        setStatus('detecting');

        // start simple capture loop
        const interval = setInterval(async () => {
          if (!videoRef.current || !canvasRef.current) return;
          const v = videoRef.current;
          if (v.videoWidth === 0 || v.videoHeight === 0) return;

          canvasRef.current.width = v.videoWidth;
          canvasRef.current.height = v.videoHeight;
          const ctx = canvasRef.current.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(v, 0, 0, v.videoWidth, v.videoHeight);

          canvasRef.current.toBlob(async (blob) => {
            if (!blob) return;
            try {
              setStatus('processing');
              // call backend recognition endpoint (reuse global function if available)
              // lightweight: POST to /api/face/recognize - but here we'll just set demo
              // TODO: integrate with existing recognizeFace service
              // For now show a fake success every now and then for demo
              if (Math.random() > 0.98) {
                setResultText(name + ' (Demo User)');
                setConfidence(0.91);
                setStatus('success');
                if (audioEnabled) audioFeedback.playSuccess();
                setTimeout(() => {
                  setStatus('detecting');
                  setResultText('');
                }, SUCCESS_DISPLAY_DURATION);
              }
            } catch (err) {
              logger.error('Session recognition failed', err);
              setStatus('failed');
              setResultText('Recognition error');
            }
          }, 'image/jpeg', 0.9);
        }, 800);

        return () => {
          clearInterval(interval);
        };
      } catch (e) {
        logger.error('Failed to open camera in session view', e);
        setStatus('failed');
        setResultText('Camera access denied');
      }
    };

    start();

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [deviceId]);

  return (
    <div className="min-h-screen bg-secondary-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <Link to="/face-app/multi-camera" className="inline-flex items-center gap-2 text-secondary-600 hover:text-secondary-900 text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Multi Camera
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">{name} — Large Session View</h2>
              <div className="text-sm text-secondary-600">Threshold: {(MATCH_THRESHOLD * 100).toFixed(0)}%</div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setAudioEnabled(e => !e)}
                className={`px-3 py-2 rounded-lg text-sm ${audioEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary-200 text-secondary-600'}`}
              >
                {audioEnabled ? 'Audio On' : 'Audio Off'}
              </button>
            </div>
          </div>

          <div className="relative bg-black rounded-lg overflow-hidden" style={{ height: '75vh' }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />

            {status === 'success' && (
              <div className="absolute bottom-6 left-6 right-6">
                <div className="bg-emerald-500/95 backdrop-blur-sm rounded-lg p-4 text-white">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-8 h-8" />
                    <div>
                      <div className="font-semibold text-lg">{resultText}</div>
                      <div className="text-sm opacity-90">{(confidence * 100).toFixed(1)}% match</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {status === 'failed' && (
              <div className="absolute bottom-6 left-6 right-6">
                <div className="bg-red-500/90 rounded-lg p-4 text-white">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-6 h-6" />
                    <div className="font-semibold">{resultText || 'Recognition failed'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 bg-secondary-50 rounded-lg p-3 text-sm">
            <div><strong>Device:</strong> {deviceId}</div>
            <div><strong>Note:</strong> This view is a pop-out single-session window.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiCameraSessionView;
