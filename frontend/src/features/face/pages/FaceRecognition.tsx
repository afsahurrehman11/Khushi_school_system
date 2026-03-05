/**
 * Face App - Live Recognition Page
 * Auto-detects person type, cleaner popups, developer mode
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  AlertCircle,
  CheckCircle2,
  Loader2,
  User,
  XCircle,
  Code,
  ChevronDown,
  ChevronUp,
  Video,
} from 'lucide-react';
import {
  recognizeFace,
  loadEmbeddingsCache,
  getFaceStatus,
  getDebugRankings,
  getCacheStats,
} from '../services/faceApi';
import type { RecognitionResult, FaceStatus, DebugRanking, CacheStats } from '../types';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';
import { AudioFeedback } from '../../../utils/audioFeedback';

// Initialize audio feedback singleton
const audioFeedback = new AudioFeedback();

// Recognition states
type RecognitionState = 'idle' | 'detecting' | 'stabilizing' | 'capturing' | 'processing' | 'success' | 'failed' | 'no_match';

const FaceRecognition: React.FC = () => {
  const [, setStatus] = useState<FaceStatus | null>(null);
  const [recognitionState, setRecognitionState] = useState<RecognitionState>('idle');
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoadingEmbeddings, setIsLoadingEmbeddings] = useState(true);
  const [embeddingsError, setEmbeddingsError] = useState('');

  // Developer mode
  const [devMode, setDevMode] = useState(false);
  const [devRankings, setDevRankings] = useState<DebugRanking[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [showDevPanel, setShowDevPanel] = useState(false);

  // Camera refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const lastCaptureRef = useRef<Blob | null>(null);

  // Face detection refs
  const detectionFrameRef = useRef<number | null>(null);
  const stabilityCountRef = useRef(0);
  const MAX_RETRY = 5;
  const STABILITY_THRESHOLD = 15; // frames with face detected (increased for better stability)
  const SUCCESS_DISPLAY_DURATION = 7000; // ms - 7 seconds as per requirements
  const STABILIZATION_FRAMES = 20; // Total frames needed for stabilization

  // Stabilization progress state
  const [stabilizationProgress, setStabilizationProgress] = useState(0);

  useEffect(() => {
    const initializePage = async () => {
      try {
        setIsLoadingEmbeddings(true);
        setEmbeddingsError('');
        logger.info('FACE RECOGNITION', 'Loading embeddings cache...');

        await loadEmbeddingsCache();
        logger.info('FACE RECOGNITION', 'Embeddings cache loaded successfully');

        await checkSystemStatus();
        await loadCacheStats();
        setIsLoadingEmbeddings(false);
      } catch (err: any) {
        logger.error('FACE RECOGNITION', `Failed to load embeddings: ${err}`);
        setEmbeddingsError(err.message || 'Failed to load embeddings. Please refresh.');
        setIsLoadingEmbeddings(false);
      }
    };
    initializePage();
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

  const loadCacheStats = async () => {
    try {
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch (err) {
      logger.error('FACE RECOGNITION', `Failed to get cache stats: ${err}`);
    }
  };

  const startCamera = async () => {
    try {
      setErrorMessage('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
        setRecognitionState('detecting');
        setStabilizationProgress(0);
        stabilityCountRef.current = 0;
        logger.info('FACE RECOGNITION', 'Camera started, beginning detection');
        startDetection();
      }
    } catch (err: any) {
      logger.error('FACE RECOGNITION', `Camera access error: ${err}`);
      let errorMsg = 'Camera access denied. Please allow camera permissions.';
      if (err.name === 'NotFoundError') {
        errorMsg = 'No camera found. Please connect a camera.';
      } else if (err.name === 'NotReadableError') {
        errorMsg = 'Camera is in use by another application.';
      } else if (err.name === 'OverconstrainedError') {
        errorMsg = 'Camera does not meet requirements.';
      }
      setErrorMessage(errorMsg);
      setRecognitionState('failed');
      audioFeedback.playFailure();
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
    // Face detection using brightness/variance heuristics with improved stability
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

        // Enhanced face detection: check center region for presence
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const sampleWidth = 180;
        const sampleHeight = 220;

        const imageData = ctx.getImageData(
          centerX - sampleWidth / 2,
          centerY - sampleHeight / 2,
          sampleWidth,
          sampleHeight
        );

        // Calculate variance in the sample region for face presence detection
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

        // If variance is above threshold, face likely present
        if (variance > 400) {
          stabilityCountRef.current++;
          
          // Update stabilization progress for UI
          const progress = Math.min((stabilityCountRef.current / STABILIZATION_FRAMES) * 100, 100);
          setStabilizationProgress(progress);

          // Transition to stabilizing state
          if (recognitionState === 'detecting' && stabilityCountRef.current >= STABILITY_THRESHOLD) {
            setRecognitionState('stabilizing');
            logger.info('FACE RECOGNITION', 'Face detected, stabilizing...');
          }
          
          // Ready to capture after full stabilization
          if (stabilityCountRef.current >= STABILIZATION_FRAMES) {
            captureAndRecognize();
            return;
          }
        } else {
          // Face not detected - reduce stability count gradually
          stabilityCountRef.current = Math.max(0, stabilityCountRef.current - 2);
          setStabilizationProgress(Math.max(0, (stabilityCountRef.current / STABILIZATION_FRAMES) * 100));
          
          if (recognitionState === 'stabilizing' && stabilityCountRef.current < STABILITY_THRESHOLD) {
            setRecognitionState('detecting');
            logger.info('FACE RECOGNITION', 'Face lost, back to detecting');
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

      lastCaptureRef.current = blob;
      setRecognitionState('processing');
      logger.info('FACE RECOGNITION', `Processing image... (attempt ${retryCount + 1}/${MAX_RETRY})`);

      try {
        // Auto-detect: Backend determines if student or teacher
        const recognitionResult = await recognizeFace(blob);

        if (recognitionResult.status === 'success' && recognitionResult.match) {
          setResult(recognitionResult);
          setRecognitionState('success');
          
          // Play success audio
          audioFeedback.playSuccess();
          
          logger.info(
            'FACE RECOGNITION',
            `Match found: ${recognitionResult.match.name} (${(recognitionResult.match.confidence * 100).toFixed(1)}%)`
          );

          // Load debug rankings if in dev mode
          if (devMode) {
            await loadDebugRankings(blob);
          }

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
  }, [retryCount, devMode]);

  const handleRecognitionFailure = (message: string) => {
    logger.warn('FACE RECOGNITION', `${message} (retry ${retryCount + 1}/${MAX_RETRY})`);

    if (retryCount < MAX_RETRY - 1) {
      setRetryCount((prev) => prev + 1);
      setRecognitionState('detecting');
      stabilityCountRef.current = 0;
      setStabilizationProgress(0);
      startDetection();
    } else {
      setRecognitionState('no_match');
      setErrorMessage(message);
      
      // Play failure audio when max retries reached
      audioFeedback.playFailure();
      
      logger.error('FACE RECOGNITION', `Max retries reached: ${message}`);

      // Auto reset after failure
      setTimeout(() => {
        resetRecognition();
      }, SUCCESS_DISPLAY_DURATION);
    }
  };

  const resetRecognition = () => {
    logger.info('FACE RECOGNITION', 'Resetting recognition state for next scan...');
    setResult(null);
    setRetryCount(0);
    setErrorMessage('');
    setDevRankings([]);
    stabilityCountRef.current = 0;
    setStabilizationProgress(0);
    
    // Cancel any existing detection loop
    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
      detectionFrameRef.current = null;
    }
    
    if (cameraActive && videoRef.current?.srcObject) {
      // Ensure we're back in detecting state
      setRecognitionState('detecting');
      logger.info('FACE RECOGNITION', 'Camera active, restarting face detection...');
      // Small delay to ensure state has updated
      setTimeout(() => {
        startDetection();
      }, 100);
    } else {
      setRecognitionState('idle');
      logger.info('FACE RECOGNITION', 'Camera not active, returning to idle state');
    }
  };

  const loadDebugRankings = async (blob: Blob) => {
    try {
      const rankingsData = await getDebugRankings(blob);
      setDevRankings(rankingsData.rankings);
    } catch (err) {
      logger.error('FACE RECOGNITION', `Failed to load debug rankings: ${err}`);
    }
  };

  

  const getStateIndicator = () => {
    switch (recognitionState) {
      case 'idle':
        return { icon: Camera, text: 'Start Camera', color: 'text-secondary-600' };
      case 'detecting':
        return { icon: Camera, text: 'Detecting face...', color: 'text-blue-600' };
      case 'stabilizing':
        return { icon: Camera, text: `Hold still... ${Math.round(stabilizationProgress)}%`, color: 'text-yellow-600' };
      case 'capturing':
        return { icon: Camera, text: 'Capturing...', color: 'text-green-600' };
      case 'processing':
        return { icon: Loader2, text: `Processing (${retryCount + 1}/${MAX_RETRY})...`, color: 'text-primary-600' };
      case 'success':
        return { icon: CheckCircle2, text: 'Match Found!', color: 'text-green-600' };
      case 'failed':
        return { icon: AlertCircle, text: 'Error', color: 'text-red-600' };
      case 'no_match':
        return { icon: XCircle, text: 'No Match', color: 'text-red-600' };
      default:
        return { icon: Camera, text: 'Ready', color: 'text-secondary-600' };
    }
  };

  const stateIndicator = getStateIndicator();

  // Show loading screen while embeddings are being loaded
  if (isLoadingEmbeddings) {
    return (
      <div className="min-h-screen bg-secondary-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-secondary-900 mb-2">Loading Recognition System</h2>
          <p className="text-sm text-secondary-600">Preparing embeddings...</p>
        </div>
      </div>
    );
  }

  // Show error screen if embeddings failed to load
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
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/face-app"
            className="inline-flex items-center gap-2 text-secondary-600 hover:text-secondary-900 mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-secondary-900">Face Recognition</h1>
              <p className="text-secondary-500 text-sm mt-1">Auto-detect students and teachers</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/face-app/multi-camera"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white text-secondary-600 border border-secondary-200 hover:bg-secondary-50"
              >
                <Video className="w-4 h-4" />
                Multi-Camera Sessions
              </Link>

              <button
                onClick={() => setDevMode(!devMode)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  devMode
                    ? 'bg-purple-100 text-purple-700 border border-purple-300'
                    : 'bg-white text-secondary-600 border border-secondary-200 hover:bg-secondary-50'
                }`}
              >
                <Code className="w-4 h-4" />
                Developer Mode
              </button>
            </div>
          </div>
        </div>

        {/* Camera Panel */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
          {/* State Indicator */}
          <div className={`p-3 border-b border-secondary-100 flex items-center gap-3 ${stateIndicator.color}`}>
            {recognitionState === 'processing' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <stateIndicator.icon className="w-5 h-5" />
            )}
            <span className="font-medium text-sm">{stateIndicator.text}</span>
            {retryCount > 0 && recognitionState !== 'success' && (
              <span className="text-xs text-secondary-500 ml-auto">
                Retry {retryCount}/{MAX_RETRY}
              </span>
            )}
          </div>

          {/* Camera View */}
          <div className="relative aspect-video bg-black">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />

            {/* Success Popup - Enhanced with full details */}
            <AnimatePresence>
              {recognitionState === 'success' && result?.match && (
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
                    className="bg-white rounded-xl p-4 shadow-2xl border-2 border-emerald-400 max-w-md w-full"
                  >
                    {/* Header with photo and name */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-16 h-16 rounded-full bg-secondary-100 overflow-hidden flex-shrink-0 border-2 border-emerald-300">
                        {result.match.profile_image_url ? (
                          <img
                            src={result.match.profile_image_url}
                            alt={result.match.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-8 h-8 text-secondary-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-secondary-900 truncate">{result.match.name}</h3>
                        <p className="text-xs text-emerald-600 font-medium capitalize">
                          {result.match.person_type === 'student' ? 'Student' : 'Teacher/Staff'}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      </div>
                    </div>

                    {/* Person Details */}
                    <div className="bg-secondary-50 rounded-lg p-3 mb-3 space-y-2">
                      {result.match.person_type === 'student' ? (
                        <>
                          {/* Student Details */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {result.match.student_id && (
                              <div>
                                <span className="text-secondary-500">Reg. No:</span>
                                <p className="font-semibold text-secondary-900">{result.match.student_id}</p>
                              </div>
                            )}
                            {result.match.roll_number && (
                              <div>
                                <span className="text-secondary-500">Roll No:</span>
                                <p className="font-semibold text-secondary-900">{result.match.roll_number}</p>
                              </div>
                            )}
                            {result.match.class_id && (
                              <div>
                                <span className="text-secondary-500">Class:</span>
                                <p className="font-semibold text-secondary-900">
                                  {result.match.class_id}
                                  {result.match.section && ` - ${result.match.section}`}
                                </p>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Teacher/Employee Details */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {result.match.teacher_id && (
                              <div>
                                <span className="text-secondary-500">Employee ID:</span>
                                <p className="font-semibold text-secondary-900">{result.match.teacher_id}</p>
                              </div>
                            )}
                            {result.match.email && (
                              <div className="col-span-2">
                                <span className="text-secondary-500">Email:</span>
                                <p className="font-semibold text-secondary-900 truncate">{result.match.email}</p>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Attendance Info */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-emerald-50 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-emerald-600 uppercase tracking-wide font-medium">Confidence</p>
                        <p className="text-lg font-bold text-emerald-700">
                          {(result.match.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-blue-600 uppercase tracking-wide font-medium">
                          {result.attendance?.action === 'check_out' ? 'Check-out' : 'Check-in'}
                        </p>
                        <p className="text-sm font-bold text-blue-700 truncate">
                          {result.attendance?.action === 'check_out' 
                            ? result.attendance?.check_out_time 
                            : result.attendance?.check_in_time || result.attendance?.time || 'N/A'}
                        </p>
                      </div>
                      {result.attendance?.status && (
                        <div className={`rounded-lg p-2 text-center ${
                          result.attendance.status === 'present' 
                            ? 'bg-emerald-50' 
                            : result.attendance.status === 'late' 
                            ? 'bg-amber-50' 
                            : 'bg-secondary-50'
                        }`}>
                          <p className="text-[10px] uppercase tracking-wide font-medium text-secondary-600">Status</p>
                          <p className={`text-sm font-bold capitalize ${
                            result.attendance.status === 'present' 
                              ? 'text-emerald-700' 
                              : result.attendance.status === 'late' 
                              ? 'text-amber-700' 
                              : 'text-secondary-700'
                          }`}>
                            {result.attendance.status}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Action indicator */}
                    {result.attendance && (
                      <div className={`p-2 rounded-lg mb-3 text-center ${
                        result.attendance.action === 'check_out' 
                          ? 'bg-purple-50' 
                          : result.attendance.action === 'already_checked_out'
                          ? 'bg-secondary-100'
                          : 'bg-blue-50'
                      }`}>
                        <span className={`text-sm font-semibold ${
                          result.attendance.action === 'check_out' 
                            ? 'text-purple-700' 
                            : result.attendance.action === 'already_checked_out'
                            ? 'text-secondary-600'
                            : 'text-blue-700'
                        }`}>
                          {result.attendance.action === 'check_out'
                            ? '✓ Checked Out Successfully'
                            : result.attendance.action === 'check_in'
                            ? '✓ Checked In Successfully'
                            : result.attendance.action === 'already_checked_out'
                            ? 'Already Checked Out Today'
                            : '✓ Verified'}
                        </span>
                      </div>
                    )}

                    {/* Countdown progress bar */}
                    <motion.div
                      initial={{ width: '100%' }}
                      animate={{ width: '0%' }}
                      transition={{ duration: SUCCESS_DISPLAY_DURATION / 1000, ease: 'linear' }}
                      className="h-1.5 bg-emerald-500 rounded-full"
                    />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* No Match Popup - Enhanced */}
            <AnimatePresence>
              {recognitionState === 'no_match' && (
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
                    <XCircle className="w-14 h-14 text-red-500 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-secondary-900 mb-2">Recognition Failed</h3>
                    <p className="text-sm text-secondary-600 mb-3">{errorMessage || 'Person not found in database'}</p>
                    <div className="bg-red-50 rounded-lg p-3 mb-3">
                      <p className="text-xs text-red-600">
                        Please ensure your face is registered in the system or contact admin.
                      </p>
                    </div>
                    <p className="text-xs text-secondary-400">Preparing for next scan...</p>
                    
                    {/* Countdown progress bar */}
                    <motion.div
                      initial={{ width: '100%' }}
                      animate={{ width: '0%' }}
                      transition={{ duration: SUCCESS_DISPLAY_DURATION / 1000, ease: 'linear' }}
                      className="h-1.5 bg-red-400 rounded-full mt-3"
                    />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Camera Error Popup */}
            <AnimatePresence>
              {recognitionState === 'failed' && errorMessage && (
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
                    className="bg-white rounded-xl p-6 shadow-2xl border-2 border-orange-400 max-w-sm w-full text-center"
                  >
                    <AlertCircle className="w-14 h-14 text-orange-500 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-secondary-900 mb-2">Camera Error</h3>
                    <p className="text-sm text-secondary-600 mb-3">{errorMessage}</p>
                    <Button 
                      onClick={() => {
                        setRecognitionState('idle');
                        setErrorMessage('');
                      }}
                      className="w-full"
                    >
                      Try Again
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Face Guide with Progress */}
            {cameraActive && (recognitionState === 'detecting' || recognitionState === 'stabilizing') && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative">
                  {/* Face outline */}
                  <div 
                    className={`w-48 h-64 rounded-3xl transition-all duration-300 ${
                      recognitionState === 'stabilizing' 
                        ? 'border-4 border-amber-400' 
                        : 'border-2 border-dashed border-white/40'
                    }`}
                    style={{
                      boxShadow: recognitionState === 'stabilizing' 
                        ? `0 0 ${Math.round(stabilizationProgress / 5)}px rgba(251, 191, 36, 0.5)` 
                        : 'none'
                    }}
                  />
                  
                  {/* Stabilization progress bar */}
                  {recognitionState === 'stabilizing' && (
                    <div className="absolute -bottom-8 left-0 right-0">
                      <div className="bg-black/50 rounded-full h-2 mx-4 overflow-hidden">
                        <motion.div
                          className="h-full bg-amber-400 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${stabilizationProgress}%` }}
                          transition={{ duration: 0.1 }}
                        />
                      </div>
                      <p className="text-center text-white text-xs mt-1 font-medium">
                        Hold still... {Math.round(stabilizationProgress)}%
                      </p>
                    </div>
                  )}
                  
                  {/* Detecting state hint */}
                  {recognitionState === 'detecting' && (
                    <p className="absolute -bottom-8 left-0 right-0 text-center text-white/70 text-xs">
                      Position your face in the frame
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="p-4 bg-secondary-50 flex items-center justify-center gap-3">
            {!cameraActive ? (
              <Button onClick={startCamera} className="px-6">
                <Camera className="w-4 h-4 mr-2" />
                Start Camera
              </Button>
            ) : (
              <Button variant="secondary" onClick={stopCamera}>
                Stop Camera
              </Button>
            )}
          </div>
        </div>

        {/* Developer Mode Panel */}
        {devMode && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <button
              onClick={() => setShowDevPanel(!showDevPanel)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-purple-900 text-sm">Developer Debug Panel</h3>
                <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">FOR DEBUGGING ONLY</span>
              </div>
              {showDevPanel ? <ChevronUp className="w-5 h-5 text-purple-600" /> : <ChevronDown className="w-5 h-5 text-purple-600" />}
            </button>

            {showDevPanel && (
              <div className="mt-4 space-y-4">
                {/* Cache Statistics */}
                {cacheStats && (
                  <div className="bg-white rounded-lg p-4 border border-purple-200">
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
                    <div className="mt-3 p-2 bg-secondary-50 rounded text-xs text-secondary-600">
                      <p>
                        <strong>Cache Status:</strong>{' '}
                        {cacheStats.cache_loaded ? (
                          <span className="text-emerald-600 font-medium">✓ Loaded</span>
                        ) : (
                          <span className="text-red-600 font-medium">✗ Not Loaded</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Embedding Rankings */}
                {devRankings.length > 0 && (
                  <div className="bg-white rounded-lg p-4 border border-purple-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-secondary-900 text-sm">
                        Detailed Embedding Rankings (All {devRankings.length} Comparisons)
                      </h4>
                      <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded font-medium">
                        Live Console
                      </span>
                    </div>

                    {/* Summary Bar */}
                    <div className="mb-3 p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-secondary-600">Top Match:</span>
                          <p className="font-bold text-secondary-900 truncate">{devRankings[0]?.name}</p>
                        </div>
                        <div>
                          <span className="text-secondary-600">Confidence:</span>
                          <p className="font-bold text-emerald-600">{(devRankings[0]?.confidence * 100).toFixed(2)}%</p>
                        </div>
                        <div>
                          <span className="text-secondary-600">Type:</span>
                          <p className="font-medium text-purple-700 capitalize">{devRankings[0]?.person_type}</p>
                        </div>
                        <div>
                          <span className="text-secondary-600">Above 85%:</span>
                          <p className="font-bold text-blue-700">
                            {devRankings.filter((r) => r.confidence >= 0.85).length}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Rankings Table */}
                    <div className="max-h-[500px] overflow-y-auto space-y-1.5">
                      {devRankings.map((ranking, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded text-xs transition-all ${
                            idx === 0
                              ? 'bg-gradient-to-r from-emerald-100 to-emerald-50 border-2 border-emerald-400 shadow-sm'
                              : idx === 1
                              ? 'bg-gradient-to-r from-amber-100 to-amber-50 border border-amber-300'
                              : idx === 2
                              ? 'bg-gradient-to-r from-orange-50 to-orange-25 border border-orange-200'
                              : ranking.confidence >= 0.85
                              ? 'bg-emerald-50 border border-emerald-200'
                              : ranking.confidence >= 0.70
                              ? 'bg-amber-50 border border-amber-100'
                              : 'bg-secondary-50 border border-secondary-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {/* Rank Badge */}
                            <span
                              className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${
                                idx === 0
                                  ? 'bg-emerald-600 text-white'
                                  : idx === 1
                                  ? 'bg-amber-600 text-white'
                                  : idx === 2
                                  ? 'bg-orange-600 text-white'
                                  : 'bg-secondary-300 text-secondary-700'
                              }`}
                            >
                              #{idx + 1}
                            </span>

                            {/* Name */}
                            <span className="font-semibold text-secondary-900 truncate min-w-[100px]">{ranking.name}</span>

                            {/* ID */}
                            <span className="text-secondary-500 text-[10px] truncate font-mono">
                              {ranking.student_id || ranking.teacher_id}
                            </span>

                            {/* Type Badge */}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                ranking.person_type === 'student'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-purple-600 text-white'
                              }`}
                            >
                              {ranking.person_type}
                            </span>

                            {/* Additional Info */}
                            {ranking.class_id && (
                              <span className="text-[10px] text-secondary-500">
                                {ranking.class_id}-{ranking.section}
                              </span>
                            )}
                          </div>

                          {/* Confidence Score */}
                          <div className="text-right ml-2 flex items-center gap-1">
                            <span
                              className={`font-bold text-sm ${
                                ranking.confidence >= 0.85
                                  ? 'text-emerald-700'
                                  : ranking.confidence >= 0.70
                                  ? 'text-amber-700'
                                  : ranking.confidence >= 0.50
                                  ? 'text-orange-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {(ranking.confidence * 100).toFixed(3)}%
                            </span>
                            {idx < 3 && <span className={idx === 0 ? 'text-emerald-600' : idx === 1 ? 'text-amber-600' : 'text-orange-600'}>🏆</span>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Diagnostic Notes */}
                    <div className="mt-4 space-y-2">
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
                        <strong>✓ Expected Behavior:</strong> Correct person should be #1 with confidence &gt; 85%. If
                        correct person is in top 3-5, model is working but might need higher threshold.
                      </div>
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
                        <strong>⚠ Wrong Match:</strong> If correct person is NOT in top 5, check: (1) Image quality, (2)
                        Lighting conditions, (3) Face angle, (4) Embedding model version mismatch.
                      </div>
                      <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-900">
                        <strong>🐛 Always Same Person:</strong> If EVERY scan matches same person, check backend logs for
                        embedding generation errors. Query embedding might be corrupted or constant.
                      </div>
                    </div>
                  </div>
                )}

                {devRankings.length === 0 && recognitionState === 'idle' && (
                  <div className="bg-white rounded-lg p-4 border border-purple-200 text-center text-sm text-secondary-500">
                    Rankings will appear here after a face scan
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceRecognition;
