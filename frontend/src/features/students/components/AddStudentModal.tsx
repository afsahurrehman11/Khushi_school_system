import React, { useState, useRef, useEffect } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import ImageUpload from './ImageUpload';
import AdmissionFormPopup from '../../../components/AdmissionFormPopup';
import { apiCallJSON, getAuthHeaders } from '../../../utils/api';
import { config } from '../../../config';
import { entitySync } from '../../../utils/entitySync';
import logger from '../../../utils/logger';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStudentAdded?: () => void;
  student?: any; // optional initial student for edit
  onStudentUpdated?: () => void;
  classesFromParent?: any[];
}

interface FormData {
  full_name: string;
  roll_number: string;
  class_id: string;
  gender: string;
  date_of_birth: string;
  admission_date: string;
  parent_cnic: string;
  parent_name: string;
  parent_contact: string;
  phone: string;
  address: string;
}

const initialFormData: FormData = {
  full_name: '',
  roll_number: '',
  class_id: '',
  gender: '',
  date_of_birth: '',
  admission_date: new Date().toISOString().split('T')[0],
  parent_cnic: '',
  parent_name: '',
  parent_contact: '',
  phone: '',
  address: '',
};

const AddStudentModal: React.FC<AddStudentModalProps> = ({ isOpen, onClose, onStudentAdded, student, onStudentUpdated, classesFromParent }) => {
  const [formData, setFormData] = useState<FormData>({ ...initialFormData });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newStudentId, setNewStudentId] = useState<string | null>(null);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showAdmissionPopup, setShowAdmissionPopup] = useState(false);
  const [admissionStudent, setAdmissionStudent] = useState<any | null>(null);
  // Inline image-before-create state
  const [inlineImageFile, setInlineImageFile] = useState<File | null>(null);
  const [inlinePreviewUrl, setInlinePreviewUrl] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [showInlineCamera, setShowInlineCamera] = useState(false);
  const [inlineStream, setInlineStream] = useState<MediaStream | null>(null);
  const [classesList, setClassesList] = useState<Array<any>>([]);
  const inlineVideoRef = useRef<HTMLVideoElement | null>(null);
  const inlineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inlineFileRef = useRef<HTMLInputElement | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Basic validation
    if (!formData.full_name.trim()) {
      setError('Student name is required');
      setSubmitting(false);
      return;
    }
    if (!formData.roll_number.trim()) {
      setError('Roll number is required');
      setSubmitting(false);
      return;
    }
    if (!formData.class_id.trim()) {
      setError('Class is required');
      setSubmitting(false);
      return;
    }
    if (!formData.parent_cnic.trim()) {
      setError('Parent / Guardian CNIC is required');
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        full_name: formData.full_name.trim(),
        roll_number: formData.roll_number.trim(),
        class_id: formData.class_id.trim(),
        gender: formData.gender || 'Not specified',
        date_of_birth: formData.date_of_birth || new Date().toISOString().split('T')[0],
        admission_date: formData.admission_date || new Date().toISOString().split('T')[0],
        guardian_info: {
          parent_cnic: formData.parent_cnic.trim(),
          father_name: formData.parent_name.trim() || null,
          guardian_contact: formData.parent_contact || null,
          address: formData.address || null,
        },
        contact_info: {
          phone: formData.phone || null,
        },
      };

      if (student && student.id) {
        await apiCallJSON(`/api/students/${student.id}`, {
          method: 'PUT',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        entitySync.emitStudentUpdated(student.id, payload);
        setSuccess(true);
        onStudentUpdated?.();
        // Keep modal open until user explicitly closes it
        // User can close via Cancel button or X button
      } else {
        const response = await apiCallJSON('/api/students', {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        entitySync.emitStudentCreated(response.id || response._id, response);
        setSuccess(true);
        const createdId = response.id || response._id;
        setNewStudentId(createdId);
        setShowImageUpload(true);
        // show admission form popup prefilled with created student
        setAdmissionStudent(response || { id: createdId });
        setShowAdmissionPopup(true);

        // If user pre-selected or captured an image, upload it for the new student
        if (inlineImageFile) {
          try {
            const formDataImg = new FormData();
            formDataImg.append('file', inlineImageFile);

            const uploadUrl = `${config.API_BASE_URL}/api/students/${createdId}/image`;
            logger.info('IMAGE', `[IMAGE] Uploading inline image to ${uploadUrl} studentId=${createdId}`);
            const res = await fetch(uploadUrl, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: formDataImg,
            });

            logger.info('IMAGE', `[IMAGE] Upload response status: ${res.status}`);

            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              logger.error('IMAGE', `[IMAGE] Upload error body: ${JSON.stringify(errJson)}`);
              throw new Error(errJson.detail || 'Failed to upload image');
            }

            // clear inline preview on success
            setInlineImageFile(null);
            if (inlinePreviewUrl) {
              URL.revokeObjectURL(inlinePreviewUrl);
              setInlinePreviewUrl(null);
            }
            } catch (err: any) {
              setInlineError(err.message || 'Image upload failed');
            }
        }

        setFormData({ ...initialFormData });
        onStudentAdded?.();
        // Modal stays open - user closes via AdmissionFormPopup Close button
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create student');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setFormData({ ...initialFormData });
      setError(null);
      setSuccess(false);
      // stop any running camera stream and cleanup preview
      if (inlineVideoRef.current?.srcObject) {
        (inlineVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      if (inlineStream) {
        inlineStream.getTracks().forEach(t => t.stop());
      }
      if (inlinePreviewUrl) {
        URL.revokeObjectURL(inlinePreviewUrl);
        setInlinePreviewUrl(null);
      }
      setShowInlineCamera(false);
      setInlineStream(null);
      onClose();
    }
  };

  // populate form if editing
  React.useEffect(() => {
    if (student) {
      setFormData({
        full_name: student.name || student.full_name || '',
        roll_number: student.rollNo || student.roll_number || '',
        class_id: student.class || student.class_id || '',
        gender: student.gender || '',
        date_of_birth: student.dateOfBirth || student.date_of_birth || '',
        admission_date: student.admission_date || new Date().toISOString().split('T')[0],
        parent_cnic: student.parentCnic || student.parent_cnic || (student.guardian_info?.parent_cnic) || '',
        parent_name: student.guardianName || student.parent_name || (student.guardian_info?.father_name) || (student.guardian_info?.mother_name) || '',
        parent_contact: student.guardianPhone || student.parent_contact || (student.guardian_info?.guardian_contact) || '',
        phone: student.phone || (student.contact_info?.phone) || '',
        address: student.address || (student.guardian_info?.address) || '',
      });
    } else {
      setFormData({ ...initialFormData });
    }
  }, [student, isOpen]);

  // Use classes passed from parent when available; otherwise fetch on open
  useEffect(() => {
    let mounted = true;
    const fetchClasses = async () => {
      try {
        logger.info('CLASSES', '[Classes] fetching classes list');
        const data = await apiCallJSON('/api/classes');
        if (!mounted) return;
        const list = (data || []).map((c: any) => ({ id: c.id || c._id || c._id?.toString?.() || '', class_name: c.class_name || c.name, section: c.section }));
        setClassesList(list.filter((c: any) => c.id));
      } catch (err: any) {
        logger.error('CLASSES', `Failed to fetch classes: ${String(err)}`);
      }
    };

    // If parent provided classes, use them immediately
    if (classesFromParent && Array.isArray(classesFromParent)) {
      setClassesList(classesFromParent || []);
      return () => { mounted = false; };
    }

    if (isOpen) fetchClasses();
    return () => { mounted = false; };
  }, [isOpen, classesFromParent]);

  // (unique class names not needed here - section is part of class)

  useEffect(() => {
    return () => {
      if (inlinePreviewUrl) {
        URL.revokeObjectURL(inlinePreviewUrl);
      }
      // stop inline camera if still running
      if (inlineVideoRef.current?.srcObject) {
        (inlineVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      if (inlineStream) {
        inlineStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [inlinePreviewUrl]);

  // Start inline camera and request permission, ensure video plays
  const startInlineCamera = async () => {
    setInlineError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      // keep stream in state and show the camera container; attach after video mounts
      setInlineStream(stream);
      setShowInlineCamera(true);
    } catch (err) {
      setInlineError('Unable to access camera. Please allow camera permission.');
    }
  };

  // Attach stream to video element after it mounts
  useEffect(() => {
    if (showInlineCamera && inlineStream && inlineVideoRef.current) {
      inlineVideoRef.current.srcObject = inlineStream;
      const tryPlay = async () => {
        try {
          await inlineVideoRef.current?.play();
        } catch (_e) {
          // ignore play errors
        }
      };
      tryPlay();
    }
  }, [showInlineCamera, inlineStream]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={student ? "Edit Student" : "Add New Student"} size="xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            ✅ Student {student ? 'updated' : 'added'} successfully!
          </div>
        )}

        {/* Main Form Layout - Left: Form Fields, Right: Photo Upload */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
        {/* Row 1: Name & Roll Number */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="Enter student name"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Roll Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="roll_number"
                  value={formData.roll_number}
                  onChange={handleChange}
                  placeholder="e.g. 101"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                  required
                />
              </div>
            </div>

        {/* Row 2: Class, Section & Gender */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Class <span className="text-red-500">*</span>
            </label>
            {/* Class select populated from backend classes list */}
            <select
              name="class_id"
              value={formData.class_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
              required
            >
              <option value="">Select class</option>
              {classesList.map(c => (
                <option key={c.id} value={c.id}>{`${c.class_name} — ${c.section || 'A'}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Gender
            </label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

            {/* Row 3: Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Admission Date
                </label>
                <input
                  type="date"
                  name="admission_date"
                  value={formData.admission_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                />
              </div>
            </div>

            {/* Row 4: Contact */}
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Phone number"
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
              />
            </div>

            {/* Row 5: Guardian Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Parent / Guardian Name
                </label>
                <input
                  type="text"
                  name="parent_name"
                  value={formData.parent_name}
                  onChange={handleChange}
                  placeholder="Parent or guardian name"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Parent / Guardian Contact
                </label>
                <input
                  type="tel"
                  name="parent_contact"
                  value={formData.parent_contact}
                  onChange={handleChange}
                  placeholder="Parent contact number"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                />
              </div>
            </div>

            {/* Row 6: Guardian CNIC */}
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Parent / Guardian CNIC <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="parent_cnic"
                value={formData.parent_cnic}
                onChange={handleChange}
                required
                placeholder="e.g. 12345-1234567-1"
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
              />
            </div>

            {/* Row 7: Address */}
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Address
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Student address"
                rows={2}
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all resize-none text-sm"
              />
            </div>
          </div>

          {/* Right Column: Photo Upload (1/3 width) */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <label className="block text-sm font-medium text-secondary-700 mb-2">Student Photo (optional)</label>
              {inlineError && <div className="text-sm text-red-600 mb-2">{inlineError}</div>}

              <div className="border-2 border-dashed border-secondary-300 rounded-lg p-4 bg-secondary-50">
                {/* Preview box */}
                <div className="w-full aspect-square bg-white rounded-lg overflow-hidden mb-3 flex items-center justify-center">
                  {showInlineCamera ? (
                    <video ref={inlineVideoRef} muted playsInline className="w-full h-full object-cover" />
                  ) : inlinePreviewUrl ? (
                    <img src={inlinePreviewUrl} className="w-full h-full object-cover" alt="preview" />
                  ) : (
                    <div className="text-center text-secondary-400 p-4">
                      <svg className="w-16 h-16 mx-auto mb-2 text-secondary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <p className="text-sm">No photo</p>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="space-y-2">
                  {!showInlineCamera ? (
                    <>
                      <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => inlineFileRef.current?.click()}>
                        Upload Photo
                      </Button>
                      <Button type="button" variant="secondary" size="sm" className="w-full" onClick={startInlineCamera}>
                        Capture Photo
                      </Button>
                      {inlinePreviewUrl && (
                        <Button type="button" variant="danger" size="sm" className="w-full" onClick={() => { 
                          setInlineImageFile(null); 
                          if (inlinePreviewUrl) { 
                            URL.revokeObjectURL(inlinePreviewUrl); 
                            setInlinePreviewUrl(null); 
                          } 
                        }}>
                          Remove Photo
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="primary" size="sm" className="w-full" onClick={async () => {
                        if (!inlineVideoRef.current || !inlineCanvasRef.current) return;
                        const v = inlineVideoRef.current;
                        const c = inlineCanvasRef.current;
                        const ctx = c.getContext('2d');
                        if (!ctx) return;
                        c.width = v.videoWidth; c.height = v.videoHeight;
                        ctx.drawImage(v, 0, 0);
                        c.toBlob(async (blob) => {
                          if (blob) {
                            const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
                            setInlineImageFile(file);
                            const url = URL.createObjectURL(file);
                            setInlinePreviewUrl(url);
                            if (v.srcObject) {
                              (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
                            }
                            setShowInlineCamera(false);
                            setInlineStream(null);
                          }
                        }, 'image/jpeg', 0.9);
                      }}>
                        Capture
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => {
                        if (inlineVideoRef.current?.srcObject) {
                          (inlineVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
                        }
                        setShowInlineCamera(false);
                        if (inlineStream) { inlineStream.getTracks().forEach(t => t.stop()); }
                        setInlineStream(null);
                      }}>Cancel</Button>
                    </>
                  )}
                </div>

                <div className="mt-3 text-xs text-secondary-500 text-center">
                  Photos enable automatic face attendance enrollment
                </div>

                <input ref={inlineFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!f.type.startsWith('image/')) { setInlineError('Please select an image'); return; }
                  if (f.size > 10 * 1024 * 1024) { setInlineError('Image too large'); return; }
                  setInlineImageFile(f);
                  const url = URL.createObjectURL(f);
                  setInlinePreviewUrl(url);
                  setInlineError(null);
                  if (inlineVideoRef.current?.srcObject) {
                    (inlineVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
                  }
                  setShowInlineCamera(false);
                  if (inlineStream) { inlineStream.getTracks().forEach(t => t.stop()); }
                  setInlineStream(null);
                }} />
                <canvas ref={inlineCanvasRef} className="hidden" />
              </div>
            </div>
          </div>
        </div>

        {/* Form Action Buttons */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-secondary-200">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
          >
            {submitting ? 'Saving...' : (student ? 'Update Student' : 'Add Student')}
          </Button>
        </div>
      </form>

      {showAdmissionPopup && (
        <AdmissionFormPopup
          isOpen={showAdmissionPopup}
          onClose={() => {
            setShowAdmissionPopup(false);
            setNewStudentId(null);
            setSuccess(false);
            onClose();
          }}
          student={admissionStudent}
          imageUrl={inlinePreviewUrl}
        />
      )}
      {/* Inline image upload for newly created student */}
      {showImageUpload && newStudentId && (
        <div className="mt-4">
          <ImageUpload
            studentId={String(newStudentId)}
            onImageUploaded={() => {
              // hide uploader and close modal once image uploaded
              setShowImageUpload(false);
              setNewStudentId(null);
              setSuccess(false);
              onClose();
              try { entitySync.emitStudentUpdated(String(newStudentId)); } catch (_) {}
            }}
          />
        </div>
      )}
    </Modal>
  );
};

export default AddStudentModal;