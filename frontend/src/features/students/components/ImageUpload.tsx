import React, { useState, useRef } from 'react';
import { Upload, Camera, X, Loader2, Check } from 'lucide-react';
import Button from '../../../components/Button';
import { getAuthHeaders } from '../../../utils/api';
import { config } from '../../../config';
import logger from '../../../utils/logger';

interface ImageUploadProps {
  studentId: string;
  onImageUploaded?: () => void;
  currentImageUrl?: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ studentId, onImageUploaded, currentImageUrl }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showCamera, setShowCamera] = useState(false);

  const handleFileSelect = async (file: File) => {
    setError(null);
    setSuccess(false);

    // Validate file
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image size must be less than 10 MB');
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
      formData.append('file', file);

      const uploadUrl = `${config.API_BASE_URL}/api/students/${studentId}/image`;
      logger.info('IMAGE', `[ImageUpload] POST -> ${uploadUrl}`);
      const response = await fetch(
        uploadUrl,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        }
      );
      logger.info('IMAGE', `[ImageUpload] response status ${response.status}`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        logger.error('IMAGE', `[ImageUpload] failed response body ${JSON.stringify(error)}`);
        throw new Error(error.detail || 'Failed to upload image');
      }

      const result = await response.json();
      setSuccess(true);
      setError(null);
      
      // Reset preview on success
      setTimeout(() => {
        setPreviewUrl(result.image_url || null);
        setSuccess(false);
        if (onImageUploaded) onImageUploaded();
      }, 1500);
    } catch (err: any) {
      logger.error('IMAGE', `Upload error: ${String(err)}`);
      setError(err.message || 'Failed to upload image');
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
      logger.error('IMAGE', `[ImageUpload] startCamera error ${String(err)}`);
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
      const deleteUrl = `${config.API_BASE_URL}/api/students/${studentId}/image`;
      logger.info('IMAGE', `[ImageUpload] DELETE -> ${deleteUrl}`);
      const response = await fetch(deleteUrl, { method: 'DELETE', headers: getAuthHeaders() });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        logger.error('IMAGE', `[ImageUpload] delete failed body ${JSON.stringify(errBody)}`);
        throw new Error('Failed to delete image');
      }

      setPreviewUrl(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1500);
      if (onImageUploaded) onImageUploaded();
    } catch (err: any) {
      setError(err.message || 'Failed to delete image');
    }
  };

  if (showCamera) {
    return (
      <div className="space-y-4">
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full aspect-video"
          />
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={handleCameraCapture}>
            <Camera className="w-4 h-4 mr-2" />
            Capture
          </Button>
          <Button variant="secondary" className="flex-1" onClick={stopCamera}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" />
          {previewUrl ? 'Image uploaded successfully!' : 'Image deleted successfully!'}
        </div>
      )}

      {previewUrl ? (
        <div className="space-y-3">
          <div className="relative group">
            <img
              src={previewUrl}
              alt="Student"
              className="w-full h-40 object-cover rounded-lg"
            />
          </div>
          <Button
            variant="danger"
            size="sm"
            className="w-full"
            onClick={deleteImage}
          >
            <X className="w-4 h-4 mr-2" />
            Remove Photo
          </Button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-secondary-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors">
          <div className="space-y-3">
            <Upload className="w-8 h-8 text-secondary-400 mx-auto" />
            <p className="text-sm text-secondary-600">
              Drag and drop an image or click to browse
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-1" />
                    Upload
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={startCamera}
              >
                <Camera className="w-4 h-4 mr-1" />
                Capture
              </Button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleFileSelect(e.target.files[0]);
          }
        }}
      />
    </div>
  );
};

export default ImageUpload;
