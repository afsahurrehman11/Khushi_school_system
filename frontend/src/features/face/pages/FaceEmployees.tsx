/**
 * Face App - Employees Management Page
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  Camera,
  Upload,
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
  X,
  User,
  Mail,
  Phone,
} from 'lucide-react';
import {
  getEmployeesForFace,
  generateMissingEmbeddings,
  refreshAllEmbeddings,
  uploadFaceImage,
  regenerateSingleEmbedding,
} from '../services/faceApi';
import type { EmployeeFace, GenerateResult } from '../types';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import logger from '../../../utils/logger';

const FaceEmployees: React.FC = () => {
  const [employees, setEmployees] = useState<EmployeeFace[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'pending' | 'failed'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Bulk operations
  const [processingMissing, setProcessingMissing] = useState(false);
  const [processingRefresh, setProcessingRefresh] = useState(false);
  const [operationResult, setOperationResult] = useState<GenerateResult | null>(null);

  // Single employee operations
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeFace | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMode, setUploadMode] = useState<'camera' | 'file'>('camera');
  const [uploading, setUploading] = useState(false);

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<Blob | null>(null);

  useEffect(() => {
    fetchEmployees();
  }, [statusFilter]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const data = await getEmployeesForFace(statusFilter);
      setEmployees(data.employees || []);
    } catch (err) {
      logger.error('FACE UI', `Failed to fetch employees: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePrepareMissing = async () => {
    setProcessingMissing(true);
    setOperationResult(null);
    logger.info('FACE UI', 'Preparing missing employee faces...');

    try {
      const result = await generateMissingEmbeddings('employee');
      setOperationResult(result);
      logger.info('FACE UI', `Prepared ${result.success} faces, ${result.failed} failed`);
      await fetchEmployees();
    } catch (err) {
      logger.error('FACE UI', `Prepare missing failed: ${err}`);
    } finally {
      setProcessingMissing(false);
    }
  };

  const handleRefreshAll = async () => {
    setProcessingRefresh(true);
    setOperationResult(null);
    logger.info('FACE UI', 'Refreshing all employee faces...');

    try {
      const result = await refreshAllEmbeddings('employee');
      setOperationResult(result);
      logger.info('FACE UI', `Refreshed ${result.success} faces, ${result.failed} failed`);
      await fetchEmployees();
    } catch (err) {
      logger.error('FACE UI', `Refresh all failed: ${err}`);
    } finally {
      setProcessingRefresh(false);
    }
  };

  const openUploadModal = (employee: EmployeeFace) => {
    setSelectedEmployee(employee);
    setShowUploadModal(true);
    setCapturedImage(null);
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setSelectedEmployee(null);
    stopCamera();
    setCapturedImage(null);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      logger.error('FACE UI', `Camera access denied: ${err}`);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          setCapturedImage(blob);
          stopCamera();
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCapturedImage(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedEmployee || !capturedImage) return;

    setUploading(true);
    try {
      const result = await uploadFaceImage('employee', selectedEmployee.id, capturedImage);
      logger.info('FACE UI', `Image uploaded for ${selectedEmployee.teacher_id}`);

      if (result.embedding_status === 'generated') {
        logger.info('FACE UI', 'Face registered successfully');
      } else {
        logger.warn('FACE UI', `Face registration failed: ${result.embedding_error}`);
      }

      await fetchEmployees();
      closeUploadModal();
    } catch (err) {
      logger.error('FACE UI', `Upload failed: ${err}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRegenerate = async (employee: EmployeeFace) => {
    try {
      await regenerateSingleEmbedding('employee', employee.id);
      logger.info('FACE UI', `Regenerated embedding for ${employee.teacher_id}`);
      await fetchEmployees();
    } catch (err) {
      logger.error('FACE UI', `Regenerate failed: ${err}`);
    }
  };

  const filteredEmployees = employees.filter((e) =>
    e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.teacher_id?.toLowerCase().includes(search.toLowerCase()) ||
    e.email?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'generated':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
            Ready
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
            Pending
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
            Failed
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-secondary-100 text-secondary-700 rounded-full">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-secondary-50 p-6">
      <div className="max-w-7xl mx-auto">
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
              <h1 className="text-2xl font-bold text-secondary-900">Employee Face Registration</h1>
              <p className="text-secondary-500 text-sm mt-1">
                Manage face registration for employees
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handlePrepareMissing}
                disabled={processingMissing || processingRefresh}
                className="flex flex-col items-center gap-1 px-4 py-3 bg-white rounded-lg border border-secondary-200 hover:bg-green-50 hover:border-green-200 transition-colors disabled:opacity-50"
              >
                {processingMissing ? (
                  <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                ) : (
                  <Check className="w-5 h-5 text-green-600" />
                )}
                <span className="text-sm font-medium text-secondary-900">Prepare Missing Faces</span>
                <span className="text-xs text-secondary-500">Register faces that are not yet ready</span>
              </button>

              <button
                onClick={handleRefreshAll}
                disabled={processingMissing || processingRefresh}
                className="flex flex-col items-center gap-1 px-4 py-3 bg-white rounded-lg border border-secondary-200 hover:bg-blue-50 hover:border-blue-200 transition-colors disabled:opacity-50"
              >
                {processingRefresh ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                ) : (
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                )}
                <span className="text-sm font-medium text-secondary-900">Refresh All Faces</span>
                <span className="text-xs text-secondary-500">Rebuild face data for everyone</span>
              </button>
            </div>
          </div>
        </div>

        {/* Operation Result */}
        <AnimatePresence>
          {operationResult && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-4 bg-white rounded-lg border border-secondary-200 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <span className="text-sm text-secondary-700">
                  Processed <strong>{operationResult.total}</strong> records:
                </span>
                <span className="text-sm text-green-600">
                  <Check className="w-4 h-4 inline mr-1" />
                  {operationResult.success} success
                </span>
                {operationResult.failed > 0 && (
                  <span className="text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    {operationResult.failed} failed
                  </span>
                )}
              </div>
              <button onClick={() => setOperationResult(null)} className="text-secondary-400 hover:text-secondary-600">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-soft p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                placeholder="Search by name, ID, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            >
              <option value="all">All Status</option>
              <option value="ready">Ready</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Employees Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <User className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
              <p className="text-secondary-500">No employees found</p>
            </div>
          ) : (
            filteredEmployees.map((employee) => (
              <motion.div
                key={employee.id}
                whileHover={{ scale: 1.02 }}
                className="bg-white rounded-xl shadow-soft p-4 border border-secondary-100"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-lg bg-secondary-100 overflow-hidden flex-shrink-0">
                    {employee.profile_image_url ? (
                      <img
                        src={employee.profile_image_url}
                        alt={employee.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-8 h-8 text-secondary-400" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-secondary-900 truncate">{employee.name}</h3>
                    <p className="text-sm text-secondary-500">{employee.teacher_id}</p>
                    {employee.email && (
                      <p className="text-xs text-secondary-400 mt-1 flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3" />
                        {employee.email}
                      </p>
                    )}
                    {employee.phone && (
                      <p className="text-xs text-secondary-400 mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {employee.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-secondary-100">
                  {getStatusBadge(employee.embedding_status)}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openUploadModal(employee)}
                      className="p-2 text-secondary-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Upload/Retake Photo"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                    {employee.has_image && (
                      <button
                        onClick={() => handleRegenerate(employee)}
                        className="p-2 text-secondary-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Regenerate Face Data"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={closeUploadModal}
        title={`Update Photo - ${selectedEmployee?.name}`}
        size="md"
      >
        <div className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setUploadMode('camera');
                setCapturedImage(null);
              }}
              className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                uploadMode === 'camera'
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : 'border-secondary-200 text-secondary-600 hover:bg-secondary-50'
              }`}
            >
              <Camera className="w-4 h-4 inline mr-2" />
              Camera
            </button>
            <button
              onClick={() => {
                setUploadMode('file');
                setCapturedImage(null);
                stopCamera();
              }}
              className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                uploadMode === 'file'
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : 'border-secondary-200 text-secondary-600 hover:bg-secondary-50'
              }`}
            >
              <Upload className="w-4 h-4 inline mr-2" />
              Upload
            </button>
          </div>

          {/* Camera View */}
          {uploadMode === 'camera' && (
            <div className="space-y-3">
              <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                {capturedImage ? (
                  <img
                    src={URL.createObjectURL(capturedImage)}
                    alt="Captured"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {!capturedImage ? (
                <div className="flex gap-2">
                  {!cameraActive ? (
                    <Button onClick={startCamera} className="flex-1">
                      Start Camera
                    </Button>
                  ) : (
                    <Button onClick={capturePhoto} className="flex-1">
                      Capture Photo
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCapturedImage(null);
                      startCamera();
                    }}
                    className="flex-1"
                  >
                    Retake
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* File Upload */}
          {uploadMode === 'file' && (
            <div className="space-y-3">
              {capturedImage ? (
                <div className="aspect-video bg-secondary-100 rounded-lg overflow-hidden">
                  <img
                    src={URL.createObjectURL(capturedImage)}
                    alt="Selected"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <label className="block aspect-video bg-secondary-50 border-2 border-dashed border-secondary-300 rounded-lg cursor-pointer hover:bg-secondary-100 transition-colors">
                  <div className="flex flex-col items-center justify-center h-full">
                    <Upload className="w-8 h-8 text-secondary-400 mb-2" />
                    <p className="text-sm text-secondary-600">Click to select image</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              )}

              {capturedImage && (
                <Button
                  variant="secondary"
                  onClick={() => setCapturedImage(null)}
                  className="w-full"
                >
                  Select Different Image
                </Button>
              )}
            </div>
          )}

          {/* Upload Button */}
          {capturedImage && (
            <Button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Uploading...
                </>
              ) : (
                'Save Photo & Register Face'
              )}
            </Button>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default FaceEmployees;
