/**
 * Face App - Live Recognition Page
 * Real-time face detection, stabilize, capture, compare with auto-retry
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  AlertCircle,
  CheckCircle2,
  Loader2,
  User,
  XCircle,
  RefreshCw,
  History,
} from 'lucide-react';
import { recognizeFace, loadEmbeddingsCache, getFaceStatus } from '../services/faceApi';
import type { RecognitionResult, FaceStatus } from '../types';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';

// Recognition states
type RecognitionState = 'idle' | 'detecting' | 'stabilizing' | 'capturing' | 'processing' | 'success' | 'failed' | 'no_match';

const FaceRecognition: React.FC = () => {
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get('mode') as 'student' | 'employee') || 'student';

  const [status, setStatus] = useState<FaceStatus | null>(null);
  const [recognitionState, setRecognitionState] = useState<RecognitionState>('idle');
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [recentRecognitions, setRecentRecognitions] = useState<RecognitionResult[]>([]);

  // Camera refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Face detection refs
  const detectionFrameRef = useRef<number | null>(null);
  const stabilityCountRef = useRef(0);
  const MAX_RETRY = 5;
  const STABILITY_THRESHOLD = 10; // frames with face detected
  const SUCCESS_DISPLAY_DURATION = 3000; // ms

  useEffect(() => {
    checkSystemStatus();
    return () => {
      if (detectionFrameRef.current) {
        cancelAnimationFrame(detectionFrameRef.current);
      }
    };
  }, []);

  const checkSystemStatus = async () => {
    try {
      const s = await getFaceStatus();
      setStatus(s);
    } catch (err) {
      logger.error('FACE RECOGNITION', `Failed to get status: ${err}`);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
        setRecognitionState('detecting');
        logger.info('FACE RECOGNITION', 'Camera started, beginning detection');
        startDetection();
      }
    } catch (err) {
      logger.error('FACE RECOGNITION', `Camera access denied: ${err}`);
      setErrorMessage('Camera access denied. Please allow camera permissions.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
      detectionFrameRef.current = null;
    }
    setCameraActive(false);
    setRecognitionState('idle');
    stabilityCountRef.current = 0;
  };

  const startDetection = () => {
    // Simple face detection using brightness/motion heuristics
    // In production, use face-api.js or similar for proper detection
    const detectFace = () => {
      if (!videoRef.current || !canvasRef.current) {
        detectionFrameRef.current = requestAnimationFrame(detectFace);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        // Simple heuristic: check center region for presence
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const sampleWidth = 150;
        const sampleHeight = 150;

        const imageData = ctx.getImageData(
          centerX - sampleWidth / 2,
          centerY - sampleHeight / 2,
          sampleWidth,
          sampleHeight
        );

        // Calculate variance in the sample region
        let sum = 0;
        let sumSq = 0;
        const pixels = imageData.data;
        for (let i = 0; i < pixels.length; i += 4) {
          const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
          sum += gray;
          sumSq += gray * gray;
        }
        const n = pixels.length / 4;
        const mean = sum / n;
        const variance = sumSq / n - mean * mean;

        // If variance is above threshold, assume face present
        if (variance > 500) {
          stabilityCountRef.current++;
          if (recognitionState === 'detecting' && stabilityCountRef.current >= STABILITY_THRESHOLD) {
            setRecognitionState('stabilizing');
          }
          if (stabilityCountRef.current >= STABILITY_THRESHOLD + 5) {
            captureAndRecognize();
            return;
          }
        } else {
          stabilityCountRef.current = Math.max(0, stabilityCountRef.current - 2);
          if (recognitionState === 'stabilizing' && stabilityCountRef.current < STABILITY_THRESHOLD) {
            setRecognitionState('detecting');
          }
        }
      }

      detectionFrameRef.current = requestAnimationFrame(detectFace);
    };

    detectionFrameRef.current = requestAnimationFrame(detectFace);
  };

  const captureAndRecognize = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setRecognitionState('capturing');
    logger.info('FACE RECOGNITION', 'Face detected, capturing...');

    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
      detectionFrameRef.current = null;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        handleRecognitionFailure('Failed to capture image');
        return;
      }

      setRecognitionState('processing');
      logger.info('FACE RECOGNITION', `Processing image... (attempt ${retryCount + 1}/${MAX_RETRY})`);

      try {
        const recognitionResult = await recognizeFace(blob, mode);

        if (recognitionResult.status === 'success' && recognitionResult.match) {
          setResult(recognitionResult);
          setRecognitionState('success');
          setRecentRecognitions((prev) => [recognitionResult, ...prev].slice(0, 5));
          logger.info('FACE RECOGNITION', `Match found: ${recognitionResult.match.name} (${(recognitionResult.match.confidence * 100).toFixed(1)}%)`);

          // Auto reset after success
          setTimeout(() => {
            resetRecognition();
          }, SUCCESS_DISPLAY_DURATION);
        } else {
          // No match - retry
          handleRecognitionFailure(recognitionResult.message || 'No match found');
        }
      } catch (err) {
        handleRecognitionFailure(`Recognition error: ${err}`);
      }
    }, 'image/jpeg', 0.9);
  }, [mode, retryCount]);

  const handleRecognitionFailure = (message: string) => {
    logger.warn('FACE RECOGNITION', `${message} (retry ${retryCount + 1}/${MAX_RETRY})`);

    if (retryCount < MAX_RETRY - 1) {
      setRetryCount((prev) => prev + 1);
      setRecognitionState('detecting');
      stabilityCountRef.current = 0;
      startDetection();
    } else {
      setRecognitionState('no_match');
      setErrorMessage(message);
      logger.error('FACE RECOGNITION', `Max retries reached: ${message}`);

      // Auto reset after failure
      setTimeout(() => {
        resetRecognition();
      }, SUCCESS_DISPLAY_DURATION);
    }
  };

  const resetRecognition = () => {
    setResult(null);
    setRetryCount(0);
    setErrorMessage('');
    stabilityCountRef.current = 0;
    if (cameraActive) {
      setRecognitionState('detecting');
      startDetection();
    } else {
      setRecognitionState('idle');
    }
  };

  const handleRefreshCache = async () => {
    try {
      await loadEmbeddingsCache();
      await checkSystemStatus();
      logger.info('FACE RECOGNITION', 'Cache refreshed');
    } catch (err) {
      logger.error('FACE RECOGNITION', `Failed to refresh cache: ${err}`);
    }
  };

  const getStateIndicator = () => {
    switch (recognitionState) {
      case 'idle':
        return { icon: Camera, text: 'Start Camera', color: 'text-secondary-600' };
      case 'detecting':
        return { icon: Camera, text: 'Detecting face...', color: 'text-blue-600' };
      case 'stabilizing':
        return { icon: Camera, text: 'Hold still...', color: 'text-yellow-600' };
      case 'capturing':
        return { icon: Camera, text: 'Capturing...', color: 'text-green-600' };
      case 'processing':
        return { icon: Loader2, text: `Processing (${retryCount + 1}/${MAX_RETRY})...`, color: 'text-primary-600' };
      case 'success':
        return { icon: CheckCircle2, text: 'Match Found!', color: 'text-green-600' };
      case 'no_match':
        return { icon: XCircle, text: 'No Match', color: 'text-red-600' };
      default:
        return { icon: Camera, text: 'Ready', color: 'text-secondary-600' };
    }
  };

  const stateIndicator = getStateIndicator();

  return (
    <div className="min-h-screen bg-secondary-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/face-app"
            className="inline-flex items-center gap-2 text-secondary-600 hover:text-secondary-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-secondary-900">Face Recognition</h1>
              <p className="text-secondary-500 text-sm mt-1">
                {mode === 'student' ? 'Student Attendance' : 'Employee Check-in/out'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Mode Toggle */}
              <div className="flex bg-white rounded-lg border border-secondary-200 p-1">
                <Link
                  to="/face-app/recognition?mode=student"
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    mode === 'student'
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-secondary-600 hover:bg-secondary-50'
                  }`}
                >
                  Students
                </Link>
                <Link
                  to="/face-app/recognition?mode=employee"
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    mode === 'employee'
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-secondary-600 hover:bg-secondary-50'
                  }`}
                >
                  Employees
                </Link>
              </div>

              <Button variant="secondary" onClick={handleRefreshCache}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Cache
              </Button>
            </div>
          </div>
        </div>

        {/* System Status */}
        {status && !status.facenet_available && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <span className="text-yellow-800">Face recognition model not loaded. Please refresh cache.</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera Panel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-soft overflow-hidden">
              {/* State Indicator */}
              <div className={`p-4 border-b border-secondary-100 flex items-center gap-3 ${stateIndicator.color}`}>
                {recognitionState === 'processing' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <stateIndicator.icon className="w-5 h-5" />
                )}
                <span className="font-medium">{stateIndicator.text}</span>
                {retryCount > 0 && recognitionState !== 'success' && (
                  <span className="text-sm text-secondary-500 ml-auto">
                    Retry {retryCount}/{MAX_RETRY}
                  </span>
                )}
              </div>

              {/* Camera View */}
              <div className="relative aspect-video bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Success Overlay */}
                <AnimatePresence>
                  {recognitionState === 'success' && result?.match && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center"
                    >
                      <div className="bg-white rounded-2xl p-6 shadow-xl border-4 border-green-500 max-w-sm w-full mx-4">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-20 h-20 rounded-full bg-secondary-100 overflow-hidden flex-shrink-0">
                            {result.match.profile_image_url ? (
                              <img
                                src={result.match.profile_image_url}
                                alt={result.match.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <User className="w-10 h-10 text-secondary-400" />
                              </div>
                            )}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-secondary-900">{result.match.name}</h3>
                            <p className="text-secondary-600">{result.match.student_id || result.match.teacher_id || result.match.person_id}</p>
                            {result.match.class_id && (
                              <p className="text-sm text-secondary-500">{result.match.class_id}</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-green-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-green-600 uppercase tracking-wide">Confidence</p>
                            <p className="text-2xl font-bold text-green-700">
                              {(result.match.confidence * 100).toFixed(1)}%
                            </p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-blue-600 uppercase tracking-wide">Status</p>
                            <p className="text-lg font-bold text-blue-700">
                              {result.attendance?.status || 'Verified'}
                            </p>
                          </div>
                        </div>

                        <motion.div
                          initial={{ width: '100%' }}
                          animate={{ width: '0%' }}
                          transition={{ duration: SUCCESS_DISPLAY_DURATION / 1000, ease: 'linear' }}
                          className="mt-4 h-1 bg-green-500 rounded-full"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* No Match Overlay */}
                <AnimatePresence>
                  {recognitionState === 'no_match' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center"
                    >
                      <div className="bg-white rounded-2xl p-6 shadow-xl border-4 border-red-500 max-w-sm w-full mx-4 text-center">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-secondary-900 mb-2">No Match Found</h3>
                        <p className="text-secondary-600 text-sm">{errorMessage}</p>
                        <p className="text-secondary-400 text-xs mt-2">Retrying automatically...</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Face Guide Overlay */}
                {cameraActive && recognitionState === 'detecting' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-64 border-2 border-dashed border-white/50 rounded-3xl" />
                  </div>
                )}

                {/* Stabilizing Indicator */}
                {recognitionState === 'stabilizing' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    <div className="w-48 h-64 border-4 border-yellow-400 rounded-3xl animate-pulse" />
                  </motion.div>
                )}
              </div>

              {/* Controls */}
              <div className="p-4 bg-secondary-50 flex items-center justify-center gap-4">
                {!cameraActive ? (
                  <Button onClick={startCamera} className="px-8">
                    <Camera className="w-5 h-5 mr-2" />
                    Start Camera
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={stopCamera}>
                    Stop Camera
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Recent Activity Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-soft p-4">
              <h2 className="font-semibold text-secondary-900 flex items-center gap-2 mb-4">
                <History className="w-5 h-5 text-secondary-400" />
                Recent Recognitions
              </h2>

              {recentRecognitions.length === 0 ? (
                <div className="text-center py-8">
                  <User className="w-10 h-10 text-secondary-300 mx-auto mb-2" />
                  <p className="text-sm text-secondary-500">No recent recognitions</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentRecognitions.map((rec, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 bg-secondary-50 rounded-lg"
                    >
                      <div className="w-10 h-10 rounded-full bg-secondary-200 overflow-hidden flex-shrink-0">
                        {rec.match?.profile_image_url ? (
                          <img
                            src={rec.match.profile_image_url}
                            alt={rec.match.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-5 h-5 text-secondary-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-secondary-900 text-sm truncate">
                          {rec.match?.name}
                        </p>
                        <p className="text-xs text-secondary-500">
                          {rec.match?.student_id || rec.match?.teacher_id || rec.match?.person_id} • {(rec.match?.confidence || 0) * 100}%
                        </p>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="bg-white rounded-xl shadow-soft p-4 mt-4">
              <h2 className="font-semibold text-secondary-900 mb-4">Session Stats</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{recentRecognitions.length}</p>
                  <p className="text-xs text-green-600">Recognized</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">
                    {status?.cached_students || 0}
                  </p>
                  <p className="text-xs text-blue-600">In Cache</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaceRecognition;
