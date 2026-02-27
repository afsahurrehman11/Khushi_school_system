import React, { useState, useRef } from 'react';
import { Upload, Camera, X, Loader2, Check, AlertCircle } from 'lucide-react';
import Button from './Button';
import { getAuthHeaders } from '../utils/api';
import { config } from '../config';
import logger from '../utils/logger';

interface PersonImageUploadProps {
  personId: string;
  personType: 'student' | 'teacher';
  onImageUploaded?: () => void;
  currentImageUrl?: string;
  showEnrollmentStatus?: boolean;
}

const PersonImageUpload: React.FC<PersonImageUploadProps> = ({ 
  personId, 
  personType,
  onImageUploaded, 
  currentImageUrl,
  showEnrollmentStatus = true
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [enrollmentStatus, setEnrollmentStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showCamera, setShowCamera] = useState(false);

  const handleFileSelect = async (file: File) => {
    setError(null);
    setSuccess(false);
    setEnrollmentStatus(null);

    // Validate file
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5 MB');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload image
    await uploadImage(file);
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      // Use 'image' for teachers, 'file' for students - backend expects different field names
      formData.append(personType === 'teacher' ? 'image' : 'file', file);

      const endpoint = personType === 'student' ? 'students' : 'teachers';
      // config.API_BASE_URL already includes /api, so don't add it again
      const uploadUrl = `${config.API_BASE_URL}/${endpoint}/${personId}/image`;
      
      logger.info('IMAGE', `[PersonImageUpload] POST -> ${uploadUrl} (${personType})`);
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      
      logger.info('IMAGE', `[PersonImageUpload] response status ${response.status}`);

      // Check for face enrollment warning header
      const faceWarning = response.headers.get('X-Image-Warning');
      if (faceWarning && showEnrollmentStatus) {
        setEnrollmentStatus(faceWarning);
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        logger.error('IMAGE', `[PersonImageUpload] failed response body ${JSON.stringify(error)}`);
        throw new Error(error.detail || 'Failed to upload image');
      }

      const result = await response.json();
      setSuccess(true);
      setError(null);
      
      // Show success message with enrollment status
      if (result.face_enrollment_status === 'success') {
        setEnrollmentStatus('✓ Face enrollment successful');
      } else if (result.face_enrollment_status === 'failed') {
        setEnrollmentStatus('⚠ Image uploaded but face enrollment failed');
      }
      
      // Reset preview on success
      setTimeout(() => {
        setPreviewUrl(result.image_url || null);
        setSuccess(false);
        if (onImageUploaded) onImageUploaded();
      }, 1500);
    } catch (err: any) {
      logger.error('IMAGE', `Upload error: ${String(err)}`);
      setError(err.message || 'Failed to upload image');
      setEnrollmentStatus(null);
    } finally {
      setUploading(false);
    }
  };

  const handleCameraCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);

      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
          await handleFileSelect(file);
          setShowCamera(false);
          // Stop camera
          if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
          }
        }
      }, 'image/jpeg', 0.9);
    } catch (err) {
      setError('Failed to capture image');
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        setShowCamera(true);
        try { await videoRef.current.play(); } catch (_) {}
      }
    } catch (err) {
      logger.error('IMAGE', `[PersonImageUpload] startCamera error ${String(err)}`);
      setError('Unable to access camera');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  const deleteImage = async () => {
    try {
      const endpoint = personType === 'student' ? 'students' : 'teachers';
      // config.API_BASE_URL already includes /api, so don't add it again
      const deleteUrl = `${config.API_BASE_URL}/${endpoint}/${personId}/image`;
      
      logger.info('IMAGE', `[PersonImageUpload] DELETE -> ${deleteUrl}`);
      const response = await fetch(deleteUrl, { 
        method: 'DELETE', 
        headers: getAuthHeaders() 
      });

      if (!response.ok) {
        throw new Error('Failed to delete image');
      }

      setPreviewUrl(null);
      if (onImageUploaded) onImageUploaded();
    } catch (err: any) {
      logger.error('IMAGE', `Delete error: ${String(err)}`);
      setError(err.message || 'Failed to delete image');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-700">Profile Image</h4>
        {showEnrollmentStatus && enrollmentStatus && (
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <span className="text-blue-700">{enrollmentStatus}</span>
          </div>
        )}
      </div>

      {/* Preview */}
      {previewUrl && (
        <div className="relative w-40 h-40 rounded-lg overflow-hidden border-2 border-gray-200">
          <img
            src={previewUrl}
            alt="Profile preview"
            className="w-full h-full object-cover"
          />
          <button
            onClick={deleteImage}
            className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors shadow-lg"
            aria-label="Delete image"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Camera view */}
      {showCamera && (
        <div className="space-y-3">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-w-md rounded-lg border-2 border-blue-300"
          />
          <div className="flex gap-2">
            <Button onClick={handleCameraCapture} disabled={uploading}>
              <Camera className="w-4 h-4 mr-2" />
              Capture
            </Button>
            <Button variant="secondary" onClick={stopCamera}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />

      {/* Upload controls */}
      {!showCamera && (
        <div className="flex gap-3">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            variant="secondary"
          >
            <Upload className="w-4 h-4 mr-2" />
            {previewUrl ? 'Change Image' : 'Upload Image'}
          </Button>
          <Button
            onClick={startCamera}
            disabled={uploading}
            variant="secondary"
          >
            <Camera className="w-4 h-4 mr-2" />
            Use Camera
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
        className="hidden"
      />

      {/* Status messages */}
      {uploading && (
        <div className="flex items-center gap-2 text-blue-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Uploading and enrolling face...</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-600">
          <Check className="w-5 h-5" />
          <span>Image uploaded successfully!</span>
        </div>
      )}
      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
          {error}
        </div>
      )}
    </div>
  );
};

export default PersonImageUpload;
