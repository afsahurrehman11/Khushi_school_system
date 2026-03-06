/**
 * Multi-Camera Face Recognition - Redesigned & Functional
 * Features:
 * - Single column layout (stack sessions vertically)
 * - Smaller camera views (400px height)
 * - Camera device selection dropdown per session
 * - Manual Start/Stop controls
 * - Full attendance flow (check-in/check-out)
 * - Audio feedback, 90% threshold
 * - Load embeddings ONCE at startup
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  AlertCircle,
  CheckCircle2,
  Loader2,
  XCircle,
  Code,
  Plus,
  X,
  User,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
} from 'lucide-react';
import {
  recognizeFace,
  loadEmbeddingsCache,
  getFaceStatus,
  getDebugRankings,
  getCacheStats,
} from '../services/faceApi';
import type { RecognitionResult, DebugRanking, CacheStats } from '../types';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';

// Recognition states
type RecognitionState = 'idle' | 'detecting' | 'stabilizing' | 'capturing' | 'processing' | 'success' | 'failed' | 'no_match';

// Camera session interface
interface CameraSession {
  id: string;
  name: string;
  deviceId: string;
  deviceLabel: string;
  recognitionState: RecognitionState;
  result: RecognitionResult | null;
  retryCount: number;
  errorMessage: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  stream: MediaStream | null;
  isRunning: boolean;
  debugRankings: DebugRanking[];
  stabilityCount: number;
}

const MATCH_THRESHOLD = 0.90;
const MAX_RETRY = 3;
const SUCCESS_DISPLAY_DURATION = 5000;
const STABILITY_THRESHOLD = 10;

const MultiCameraFaceRecognition: React.FC = () => {
  const [isLoadingEmbeddings, setIsLoadingEmbeddings] = useState(true);
  const [embeddingsError, setEmbeddingsError] = useState('');

  // Camera devices
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);

  // Camera sessions
  const [sessions, setSessions] = useState<CameraSession[]>([]);

  // Developer mode
  const [devMode, setDevMode] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [globalDebugHistory, setGlobalDebugHistory] = useState<Array<{
    sessionName: string;
    timestamp: string;
    result: RecognitionResult | null;
    rankings: DebugRanking[];
  }>>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);

  const debugHistoryRef = useRef<HTMLDivElement>(null);
  const detectionFrameRefs = useRef<Map<string, number>>(new Map());

  // Initialize: Load embeddings ONCE
  useEffect(() => {
    const initializePage = async () => {
      try {
        setIsLoadingEmbeddings(true);
        
        logger.info('FACE-RECOGNITION', 'Loading embeddings cache (one-time load)...');
        await loadEmbeddingsCache();
        
        await getFaceStatus();
        
        const stats = await getCacheStats();
        setCacheStats(stats);
        
        await enumerateCameras();
        
        setIsLoadingEmbeddings(false);
        logger.info('FACE-RECOGNITION', '✅ Embeddings loaded successfully');
      } catch (error) {
        logger.error('FACE-RECOGNITION', `Failed to initialize: ${error}`);
        setEmbeddingsError('Failed to load face recognition system. Please check backend connection.');
        setIsLoadingEmbeddings(false);
      }
    };

    initializePage();

    return () => {
      sessions.forEach(session => {
        if (session.stream) {
          session.stream.getTracks().forEach(track => track.stop());
        }
        const frameId = detectionFrameRefs.current.get(session.id);
        if (frameId) cancelAnimationFrame(frameId);
      });
    };
  }, []);

  // Auto-start first session
  useEffect(() => {
    if (availableDevices.length > 0 && sessions.length === 0 && !isLoadingEmbeddings) {
      logger.info('FACE-RECOGNITION', 'Auto-creating first camera session...');
      createFirstSession();
    }
  }, [availableDevices, isLoadingEmbeddings]);

  // Enumerate cameras
  const enumerateCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      logger.info('FACE-RECOGNITION', `Found ${videoDevices.length} camera device(s)`);
      setAvailableDevices(videoDevices);
    } catch (error) {
      logger.error('FACE-RECOGNITION', `Failed to enumerate cameras: ${error}`);
    }
  };

  // Create first session
  const createFirstSession = () => {
    if (availableDevices.length === 0) return;

    const device = availableDevices[0];
    const sessionId = `session-${Date.now()}`;
    const sessionName = `Camera 1`;

    const newSession: CameraSession = {
      id: sessionId,
      name: sessionName,
      deviceId: device.deviceId,
      deviceLabel: device.label || sessionName,
      recognitionState: 'idle',
      result: null,
      retryCount: 0,
      errorMessage: '',
      videoRef: React.createRef<HTMLVideoElement>(),
      canvasRef: React.createRef<HTMLCanvasElement>(),
      stream: null,
      isRunning: false,
      debugRankings: [],
      stabilityCount: 0,
    };

    setSessions([newSession]);
  };

  // Add new session
  const addNewSession = () => {
    if (availableDevices.length === 0) {
      alert('No camera devices available');
      return;
    }

    if (sessions.length >= 4) {
      alert('Maximum 4 sessions allowed');
      return;
    }

    const sessionId = `session-${Date.now()}`;
    const sessionName = `Camera ${sessions.length + 1}`;
    const defaultDevice = availableDevices[0];

    const newSession: CameraSession = {
      id: sessionId,
      name: sessionName,
      deviceId: defaultDevice.deviceId,
      deviceLabel: defaultDevice.label || sessionName,
      recognitionState: 'idle',
      result: null,
      retryCount: 0,
      errorMessage: '',
      videoRef: React.createRef<HTMLVideoElement>(),
      canvasRef: React.createRef<HTMLCanvasElement>(),
      stream: null,
      isRunning: false,
      debugRankings: [],
      stabilityCount: 0,
    };

    setSessions(prev => [...prev, newSession]);
  };

  // Change camera device for session
  const changeSessionDevice = (sessionId: string, newDeviceId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // Stop current camera if running
    if (session.isRunning) {
      stopSessionCamera(sessionId);
    }

    // Update device
    const newDevice = availableDevices.find(d => d.deviceId === newDeviceId);
    if (newDevice) {
      setSessions(prev => prev.map(s => 
        s.id === sessionId 
          ? { ...s, deviceId: newDeviceId, deviceLabel: newDevice.label || s.name }
          : s
      ));
    }
  };

  // Start camera
  const startSessionCamera = async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    try {
      logger.info('FACE-RECOGNITION', `Starting camera for ${session.name}...`);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: session.deviceId }, width: 640, height: 480 },
      });

      if (session.videoRef.current) {
        session.videoRef.current.srcObject = stream;
        
        setSessions(prev => 
          prev.map(s => s.id === sessionId 
            ? { ...s, stream, isRunning: true, recognitionState: 'detecting', errorMessage: '' }
            : s
          )
        );
        
        startRecognitionLoop(sessionId);
      }
    } catch (error) {
      logger.error('FACE-RECOGNITION', `Failed to start camera: ${error}`);
      setSessions(prev => 
        prev.map(s => s.id === sessionId 
          ? { ...s, recognitionState: 'failed', errorMessage: 'Failed to access camera' }
          : s
        )
      );
    }
  };

  // Stop camera
  const stopSessionCamera = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    if (session.stream) {
      session.stream.getTracks().forEach(track => track.stop());
    }
    
    const frameId = detectionFrameRefs.current.get(sessionId);
    if (frameId) {
      cancelAnimationFrame(frameId);
      detectionFrameRefs.current.delete(sessionId);
    }
    
    if (session.videoRef.current) {
      session.videoRef.current.srcObject = null;
    }
    
    setSessions(prev => 
      prev.map(s => s.id === sessionId 
        ? { ...s, stream: null, isRunning: false, recognitionState: 'idle', result: null, stabilityCount: 0 }
        : s
      )
    );

    logger.info('FACE-RECOGNITION', `Camera stopped for ${session.name}`);
  };

  // Remove session
  const removeSession = (sessionId: string) => {
    stopSessionCamera(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  // Recognition loop
  const startRecognitionLoop = (sessionId: string) => {
    const detectFace = () => {
      const session = sessions.find(s => s.id === sessionId);
      if (!session || !session.isRunning || !session.videoRef.current || !session.canvasRef.current) {
        return;
      }

      const video = session.videoRef.current;
      const canvas = session.canvasRef.current;

      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        const frameId = requestAnimationFrame(detectFace);
        detectionFrameRefs.current.set(sessionId, frameId);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0);

      // Simple variance-based face detection
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const sampleWidth = 150;
      const sampleHeight = 150;

      try {
        const imageData = ctx.getImageData(
          centerX - sampleWidth / 2,
          centerY - sampleHeight / 2,
          sampleWidth,
          sampleHeight
        );

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

        if (variance > 500) {
          setSessions(prev => prev.map(s => {
            if (s.id === sessionId) {
              const newCount = s.stabilityCount + 1;
              if (newCount >= STABILITY_THRESHOLD && s.recognitionState === 'detecting') {
                setTimeout(() => captureAndRecognize(sessionId), 0);
                return { ...s, stabilityCount: newCount, recognitionState: 'stabilizing' };
              }
              return { ...s, stabilityCount: newCount };
            }
            return s;
          }));
        } else {
          setSessions(prev => prev.map(s => 
            s.id === sessionId ? { ...s, stabilityCount: Math.max(0, s.stabilityCount - 2) } : s
          ));
        }
      } catch (err) {
        logger.error('FACE-RECOGNITION', `Detection error: ${err}`);
      }

      const frameId = requestAnimationFrame(detectFace);
      detectionFrameRefs.current.set(sessionId, frameId);
    };

    const frameId = requestAnimationFrame(detectFace);
    detectionFrameRefs.current.set(sessionId, frameId);
  };

  // Capture and recognize
  const captureAndRecognize = async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session || !session.videoRef.current || !session.canvasRef.current) return;

    const frameId = detectionFrameRefs.current.get(sessionId);
    if (frameId) {
      cancelAnimationFrame(frameId);
      detectionFrameRefs.current.delete(sessionId);
    }

    const video = session.videoRef.current;
    const canvas = session.canvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      startRecognitionLoop(sessionId);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        startRecognitionLoop(sessionId);
        return;
      }

      try {
        setSessions(prev => 
          prev.map(s => s.id === sessionId ? { ...s, recognitionState: 'processing' } : s)
        );

        const result = await recognizeFace(blob);
        
        const debugData = await getDebugRankings(blob);
        const rankings = debugData.rankings;

        setSessions(prev => 
          prev.map(s => s.id === sessionId ? {
            ...s,
            result,
            debugRankings: rankings,
            recognitionState: result.match ? 'success' : 'no_match',
            retryCount: 0,
            stabilityCount: 0,
          } : s)
        );

        addToDebugHistory(session.name, result, rankings);

              // audio feedback removed

        setTimeout(() => {
          setSessions(prev => 
            prev.map(s => s.id === sessionId ? { ...s, recognitionState: 'detecting', result: null } : s)
          );
          startRecognitionLoop(sessionId);
        }, SUCCESS_DISPLAY_DURATION);

      } catch (error) {
        logger.error('FACE-RECOGNITION', `Recognition failed: ${error}`);
        
        const currentRetry = session.retryCount + 1;
        
        if (currentRetry >= MAX_RETRY) {
          setSessions(prev => 
            prev.map(s => s.id === sessionId ? {
              ...s,
              recognitionState: 'failed',
              errorMessage: 'Failed to recognize face after multiple attempts',
              retryCount: currentRetry,
              stabilityCount: 0,
            } : s)
          );
          
          setTimeout(() => {
            setSessions(prev => 
              prev.map(s => s.id === sessionId ? { ...s, recognitionState: 'detecting' } : s)
            );
            startRecognitionLoop(sessionId);
          }, 3000);
        } else {
          setSessions(prev => 
            prev.map(s => s.id === sessionId ? {
              ...s,
              recognitionState: 'detecting',
              retryCount: currentRetry,
              stabilityCount: 0,
            } : s)
          );
          startRecognitionLoop(sessionId);
        }
      }
    }, 'image/jpeg', 0.95);
  };

  // Add to debug history
  const addToDebugHistory = (sessionName: string, result: RecognitionResult | null, rankings: DebugRanking[]) => {
    const timestamp = new Date().toLocaleTimeString();
    
    setGlobalDebugHistory(prev => {
      const newHistory = [{
        sessionName,
        timestamp,
        result,
        rankings: rankings.slice(0, 5),
      }, ...prev];
      
      return newHistory.slice(0, 20);
    });

    if (debugHistoryRef.current) {
      debugHistoryRef.current.scrollTop = 0;
    }
  };

  // Get status badge
  const getSessionStatus = (state: RecognitionState) => {
    switch (state) {
      case 'idle':
        return { icon: Camera, text: 'Idle', color: 'text-secondary-400' };
      case 'detecting':
        return { icon: Loader2, text: 'Detecting...', color: 'text-blue-500', spin: true };
      case 'stabilizing':
        return { icon: Loader2, text: 'Hold still...', color: 'text-yellow-500', spin: true };
      case 'processing':
        return { icon: Loader2, text: 'Processing...', color: 'text-indigo-500', spin: true };
      case 'success':
        return { icon: CheckCircle2, text: 'Recognized', color: 'text-emerald-500' };
      case 'failed':
        return { icon: XCircle, text: 'Error', color: 'text-red-500' };
      case 'no_match':
        return { icon: AlertCircle, text: 'No Match', color: 'text-orange-500' };
      default:
        return { icon: Camera, text: 'Ready', color: 'text-secondary-600' };
    }
  };

  // Loading screen
  if (isLoadingEmbeddings) {
    return (
      <div className="min-h-screen bg-secondary-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-secondary-900 mb-2">Loading Recognition System</h2>
          <p className="text-sm text-secondary-600">Preparing embeddings...</p>
          <p className="text-xs text-secondary-400 mt-2">(Loading once, will not reload when adding cameras)</p>
        </div>
      </div>
    );
  }

  // Error screen
  if (embeddingsError) {
    return (
      <div className="min-h-screen bg-secondary-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-secondary-900 mb-2">Failed to Load System</h2>
          <p className="text-sm text-secondary-600 mb-4">{embeddingsError}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/face-app"
            className="inline-flex items-center gap-2 text-secondary-600 hover:text-secondary-900 mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-secondary-900 mb-1">
                Face Recognition
              </h1>
              <p className="text-sm text-secondary-600">
                90% threshold • Check-in/Check-out attendance • Multi-camera support
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={addNewSession}
                disabled={sessions.length >= 4}
                variant="secondary"
                className="inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Camera
              </Button>

              {/* Audio control removed per request */}

              <button
                onClick={() => setDevMode(!devMode)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  devMode
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-secondary-200 text-secondary-600'
                }`}
              >
                <Code className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Camera Sessions (Single Column) */}
        <div className="space-y-6 mb-6">
          {sessions.map((session) => {
            const statusInfo = getSessionStatus(session.recognitionState);
            const StatusIcon = statusInfo.icon;

            return (
              <div key={session.id} className="bg-white rounded-xl shadow-sm border border-secondary-200 overflow-hidden">
                {/* Session Header */}
                <div className="px-4 py-3 bg-secondary-50 border-b border-secondary-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <StatusIcon
                        className={`w-5 h-5 ${statusInfo.color} ${statusInfo.spin ? 'animate-spin' : ''}`}
                      />
                      <div>
                        <h3 className="text-sm font-semibold text-secondary-900">{session.name}</h3>
                        <p className="text-xs text-secondary-500">{statusInfo.text}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!session.isRunning ? (
                        <Button
                          onClick={() => startSessionCamera(session.id)}
                          size="sm"
                          className="inline-flex items-center gap-2"
                        >
                          <Play className="w-4 h-4" />
                          Start
                        </Button>
                      ) : (
                        <Button
                          onClick={() => stopSessionCamera(session.id)}
                          variant="secondary"
                          size="sm"
                          className="inline-flex items-center gap-2"
                        >
                          <Square className="w-4 h-4" />
                          Stop
                        </Button>
                      )}

                      {sessions.length > 1 && (
                        <button
                          onClick={() => removeSession(session.id)}
                          className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                          title="Remove session"
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Camera Selection Dropdown */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-secondary-700">Camera:</label>
                    <select
                      value={session.deviceId}
                      onChange={(e) => changeSessionDevice(session.id, e.target.value)}
                      disabled={session.isRunning}
                      className="flex-1 px-2 py-1.5 text-sm border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-secondary-100 disabled:cursor-not-allowed"
                    >
                      {availableDevices.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${device.deviceId.substring(0, 8)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Video Feed - Fixed 400px height */}
                <div className="relative bg-black" style={{ height: '400px' }}>
                  <video
                    ref={session.videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <canvas
                    ref={session.canvasRef}
                    className="hidden"
                  />

                  {/* Success Popup */}
                  <AnimatePresence>
                    {session.recognitionState === 'success' && session.result?.match && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center p-4"
                      >
                        <motion.div
                          initial={{ scale: 0.9, y: 20 }}
                          animate={{ scale: 1, y: 0 }}
                          exit={{ scale: 0.9, y: 20 }}
                          className="bg-white rounded-xl p-4 shadow-2xl border-2 border-emerald-400 max-w-sm w-full"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-14 h-14 rounded-full bg-secondary-100 overflow-hidden flex-shrink-0">
                              {session.result.match.profile_image_url ? (
                                <img
                                  src={session.result.match.profile_image_url}
                                  alt={session.result.match.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <User className="w-7 h-7 text-secondary-400" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-bold text-secondary-900 truncate">{session.result.match.name}</h3>
                              <p className="text-xs text-secondary-600 truncate">
                                {session.result.match.student_id || session.result.match.teacher_id || ''}
                              </p>
                              {session.result.match.class_id && <p className="text-xs text-secondary-500">{session.result.match.class_id}</p>}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="bg-emerald-50 rounded-lg p-2 text-center">
                              <p className="text-[10px] text-emerald-600 uppercase font-medium">Confidence</p>
                              <p className="text-lg font-bold text-emerald-700">
                                {(session.result.match.confidence * 100).toFixed(1)}%
                              </p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-2 text-center">
                              <p className="text-[10px] text-blue-600 uppercase font-medium">Time</p>
                              <p className="text-sm font-bold text-blue-700">
                                {session.result.attendance?.time || 'N/A'}
                              </p>
                            </div>
                          </div>

                          {session.result.attendance && (
                            <div className="p-2 bg-secondary-50 rounded-lg mb-3">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-secondary-600 font-medium">Action</span>
                                <span className="font-semibold text-secondary-900 capitalize">
                                  {session.result.attendance.action === 'check_out'
                                    ? 'Check Out'
                                    : session.result.attendance.action === 'check_in'
                                    ? 'Check In'
                                    : session.result.attendance.action === 'already_checked_out'
                                    ? '✓ Already Checked Out'
                                    : session.result.attendance.action || 'Verified'}
                                </span>
                              </div>
                              {session.result.attendance.status && (
                                <div className="flex justify-between items-center text-xs mt-1">
                                  <span className="text-secondary-600 font-medium">Status</span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      session.result.attendance.status === 'present'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : session.result.attendance.status === 'late'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-secondary-100 text-secondary-700'
                                    }`}
                                  >
                                    {session.result.attendance.status}
                                  </span>
                                </div>
                              )}
                              {session.result.attendance.action === 'already_checked_out' && session.result.attendance.time && (
                                <div className="mt-1 p-1.5 bg-blue-50 rounded text-xs text-blue-700">
                                  Checked out at {session.result.attendance.time}
                                </div>
                              )}
                            </div>
                          )}

                          <motion.div
                            initial={{ width: '100%' }}
                            animate={{ width: '0%' }}
                            transition={{ duration: SUCCESS_DISPLAY_DURATION / 1000, ease: 'linear' }}
                            className="h-1 bg-emerald-500 rounded-full"
                          />
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* No Match Popup */}
                  <AnimatePresence>
                    {session.recognitionState === 'no_match' && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center p-4"
                      >
                        <motion.div
                          initial={{ scale: 0.9 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0.9 }}
                          className="bg-white rounded-xl p-6 shadow-2xl border-2 border-red-400 max-w-sm w-full text-center"
                        >
                          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                          <h3 className="text-lg font-bold text-secondary-900 mb-2">No Match Found</h3>
                          <p className="text-sm text-secondary-600">Face not recognized (threshold: 90%)</p>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Face Guide */}
                  {session.isRunning && session.recognitionState === 'detecting' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-64 border-2 border-dashed border-white/40 rounded-3xl" />
                    </div>
                  )}

                  {/* Stabilizing Indicator */}
                  {session.recognitionState === 'stabilizing' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-64 border-4 border-amber-400 rounded-3xl animate-pulse" />
                    </div>
                  )}

                  {/* Error Message */}
                  {session.errorMessage && session.recognitionState === 'failed' && (
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="bg-red-500/95 rounded-lg p-3 text-white">
                        <div className="flex items-center gap-2 text-sm">
                          <AlertCircle className="w-4 h-4" />
                          <span>{session.errorMessage}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Idle State */}
                  {!session.isRunning && session.recognitionState === 'idle' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <div className="text-center text-white">
                        <Camera className="w-12 h-12 mx-auto mb-2 opacity-60" />
                        <p className="text-sm">Click "Start" to begin recognition</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Session Info */}
                <div className="px-4 py-2 bg-secondary-50 text-xs text-secondary-600">
                  <div className="flex items-center justify-between">
                    <span>Threshold: {(MATCH_THRESHOLD * 100).toFixed(0)}%</span>
                    <span>Status: {session.isRunning ? 'Running' : 'Stopped'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Developer Panel */}
        {devMode && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
            <button
              onClick={() => setShowDevPanel(!showDevPanel)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-purple-900 text-sm">Developer Debug Panel</h3>
              </div>
              {showDevPanel ? <ChevronUp className="w-5 h-5 text-purple-600" /> : <ChevronDown className="w-5 h-5 text-purple-600" />}
            </button>

            {showDevPanel && (
              <div className="mt-4 space-y-4">
                {cacheStats && (
                  <div className="bg-white rounded-lg p-4">
                    <h4 className="font-medium text-secondary-900 mb-3 text-sm">Cache Statistics</h4>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-blue-50 rounded p-2">
                        <p className="text-xs text-blue-600 font-medium">Students</p>
                        <p className="text-xl font-bold text-blue-700">{cacheStats.students_count}</p>
                      </div>
                      <div className="bg-purple-50 rounded p-2">
                        <p className="text-xs text-purple-600 font-medium">Teachers</p>
                        <p className="text-xl font-bold text-purple-700">{cacheStats.teachers_count}</p>
                      </div>
                      <div className="bg-emerald-50 rounded p-2">
                        <p className="text-xs text-emerald-600 font-medium">Total</p>
                        <p className="text-xl font-bold text-emerald-700">{cacheStats.total_embeddings}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-lg p-4">
                  <h4 className="font-medium text-secondary-900 mb-3 text-sm">Recognition History</h4>
                  
                  <div
                    ref={debugHistoryRef}
                    className="max-h-[300px] overflow-y-auto space-y-2"
                  >
                    {globalDebugHistory.length === 0 && (
                      <div className="text-center text-sm text-secondary-500 py-4">
                        No recognition history yet
                      </div>
                    )}

                    {globalDebugHistory.map((entry, idx) => (
                      <div
                        key={idx}
                        className="bg-secondary-50 rounded-lg p-2 text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-primary-700">{entry.sessionName}</span>
                          <span className="text-secondary-500">{entry.timestamp}</span>
                        </div>

                        {entry.result?.match ? (
                          <div>
                            <div className="text-sm font-medium text-emerald-700">
                              ✅ {entry.result.match.name}
                            </div>
                            <div className="text-secondary-600">
                              {(entry.result.match.confidence * 100).toFixed(2)}%
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm font-medium text-orange-600">
                            ❌ No Match
                          </div>
                        )}

                        {entry.rankings.length > 0 && (
                          <div className="mt-1 pt-1 border-t border-secondary-200">
                            {entry.rankings.slice(0, 3).map((rank, ridx) => (
                              <div key={ridx} className="flex justify-between text-secondary-600">
                                <span>#{ridx + 1}: {rank.name}</span>
                                <span>{(rank.confidence * 100).toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiCameraFaceRecognition;
