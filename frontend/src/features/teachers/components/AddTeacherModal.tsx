import React, { useState, useEffect, useRef } from 'react';
import { Loader2, UserPlus, Plus, Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { apiCallJSON, getAuthHeaders } from '../../../utils/api';
import { entitySync } from '../../../utils/entitySync';
import { config } from '../../../config';
import logger from '../../../utils/logger';

interface AddTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTeacherAdded?: () => void;
  teacher?: any; // for edit
  onTeacherUpdated?: () => void;
}

interface ClassAssignment {
  class_id: string;
  class_name: string;
  section: string;
  subjects: string[];
}

interface ClassOption {
  id: string;
  class_name: string;
  section: string;
}

const initialForm = {
  name: '',
  teacherId: '',
  cnic: '',
  email: '',
  phone: '',
  qualification: '',
  experience: '',
  dateOfJoining: new Date().toISOString().split('T')[0],
};

const AddTeacherModal: React.FC<AddTeacherModalProps> = ({ isOpen, onClose, onTeacherAdded, teacher, onTeacherUpdated }) => {
  const [form, setForm] = useState({ ...initialForm });
  const [classAssignments, setClassAssignments] = useState<ClassAssignment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [availableClasses, setAvailableClasses] = useState<ClassOption[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<any[]>([]);
  
  // Inline image upload state (like student form)
  const [inlineImageFile, setInlineImageFile] = useState<File | null>(null);
  const [inlinePreviewUrl, setInlinePreviewUrl] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [showInlineCamera, setShowInlineCamera] = useState(false);
  const [inlineStream, setInlineStream] = useState<MediaStream | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  
  const inlineVideoRef = useRef<HTMLVideoElement | null>(null);
  const inlineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inlineFileRef = useRef<HTMLInputElement | null>(null);

  // Load classes and subjects from database
  useEffect(() => {
    if (isOpen) {
      (async () => {
        try {
          const classes = await apiCallJSON('/api/classes');
          const list = (classes || []).map((c: any) => ({
            id: c.id || c._id || c._id?.toString?.() || '',
            class_name: c.class_name || c.name || '',
            section: c.section || 'A'
          }));
          setAvailableClasses(list.filter((c: ClassOption) => c.id));
        } catch { 
          setAvailableClasses([]); 
        }

        try {
          const subjects = await apiCallJSON('/api/subjects');
          setAvailableSubjects(Array.isArray(subjects) ? subjects : []);
        } catch { 
          setAvailableSubjects([]); 
        }
      })();
    }
  }, [isOpen]);

  // Populate form when editing
  useEffect(() => {
    if (teacher) {
      setForm({
        name: teacher.name || '',
        teacherId: teacher.teacherId || teacher.teacher_id || teacher.id || '',
        cnic: teacher.cnic || '',
        email: teacher.email || '',
        phone: teacher.phone || '',
        qualification: teacher.qualification || '',
        experience: teacher.experience || '',
        dateOfJoining: teacher.dateOfJoining ? new Date(teacher.dateOfJoining).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      });

      // Parse existing assignments
      const classes = teacher.assigned_classes || [];
      const assignmentsMap: { [key: string]: ClassAssignment } = {};
      classes.forEach((cls: string) => {
        const [className, section] = cls.includes('-') ? cls.split('-') : [cls, ''];
        const key = `${className}-${section}`;
        assignmentsMap[key] = { class_id: '', class_name: className, section: section || '', subjects: [] };
      });
      setClassAssignments(Object.values(assignmentsMap));
      
      // Set existing image if available
      if (teacher.profile_image_blob) {
        setInlinePreviewUrl(`data:${teacher.profile_image_type || 'image/jpeg'};base64,${teacher.profile_image_blob}`);
      }
    } else {
      setForm({ ...initialForm });
      setClassAssignments([]);
      setInlinePreviewUrl(null);
      setInlineImageFile(null);
    }
  }, [teacher, isOpen]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (inlinePreviewUrl && inlinePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(inlinePreviewUrl);
      }
      if (inlineVideoRef.current?.srcObject) {
        (inlineVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      if (inlineStream) {
        inlineStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [inlinePreviewUrl, inlineStream]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  };

  // Get unique class names from available classes
  const uniqueClassNames = Array.from(new Set(availableClasses.map(c => c.class_name)));

  // Get sections for a given class name
  const getSectionsForClass = (className: string): string[] => {
    return availableClasses
      .filter(c => c.class_name === className)
      .map(c => c.section)
      .filter((s, i, arr) => arr.indexOf(s) === i);
  };

  const addClassAssignment = () => {
    setClassAssignments([...classAssignments, { class_id: '', class_name: '', section: '', subjects: [] }]);
  };

  const removeClassAssignment = (index: number) => {
    setClassAssignments(classAssignments.filter((_, i) => i !== index));
  };

  const updateClassAssignment = (index: number, field: keyof ClassAssignment, value: any) => {
    setClassAssignments(classAssignments.map((a, i) => {
      if (i === index) {
        if (field === 'class_name') {
          // Reset section when class changes
          return { ...a, class_name: value, section: '', class_id: '' };
        }
        if (field === 'section') {
          // Find the class_id for this class_name + section combination
          const matchingClass = availableClasses.find(
            c => c.class_name === a.class_name && c.section === value
          );
          return { ...a, section: value, class_id: matchingClass?.id || '' };
        }
        return { ...a, [field]: value };
      }
      return a;
    }));
  };

  const toggleSubject = (assignmentIndex: number, subjectId: string) => {
    setClassAssignments(classAssignments.map((a, i) => {
      if (i === assignmentIndex) {
        const subjects = a.subjects.includes(subjectId)
          ? a.subjects.filter(s => s !== subjectId)
          : [...a.subjects, subjectId];
        return { ...a, subjects };
      }
      return a;
    }));
  };

  // Start inline camera
  const startInlineCamera = async () => {
    setInlineError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setInlineStream(stream);
      setShowInlineCamera(true);
    } catch (err) {
      setInlineError('Unable to access camera. Please allow camera permission.');
    }
  };

  // Capture from camera
  const captureFromCamera = async () => {
    if (!inlineVideoRef.current || !inlineCanvasRef.current) return;
    const v = inlineVideoRef.current;
    const c = inlineCanvasRef.current;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    ctx.drawImage(v, 0, 0);
    c.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
        setInlineImageFile(file);
        const url = URL.createObjectURL(file);
        if (inlinePreviewUrl && inlinePreviewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(inlinePreviewUrl);
        }
        setInlinePreviewUrl(url);
        // Stop camera
        if (v.srcObject) {
          (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        }
        setShowInlineCamera(false);
        setInlineStream(null);
      }
    }, 'image/jpeg', 0.9);
  };

  // Stop camera without capturing
  const stopInlineCamera = () => {
    if (inlineVideoRef.current?.srcObject) {
      (inlineVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setShowInlineCamera(false);
    if (inlineStream) {
      inlineStream.getTracks().forEach(t => t.stop());
    }
    setInlineStream(null);
  };

  // Upload image for existing teacher
  const uploadTeacherImage = async (teacherId: string, imageFile: File) => {
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', imageFile); // Backend expects 'image' field

      // config.API_BASE_URL already includes /api, so use direct path
      const uploadUrl = `${config.API_BASE_URL}/teachers/${teacherId}/image`;
      logger.info('IMAGE', `[AddTeacherModal] POST -> ${uploadUrl}`);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      logger.info('IMAGE', `[AddTeacherModal] response status ${response.status}`);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        logger.error('IMAGE', `[AddTeacherModal] Upload error: ${JSON.stringify(errJson)}`);
        throw new Error(errJson.detail || 'Failed to upload image');
      }

      const result = await response.json();
      logger.info('IMAGE', `[AddTeacherModal] Upload success: ${JSON.stringify(result)}`);
      return result;
    } catch (err: any) {
      setInlineError(err.message || 'Image upload failed');
      throw err;
    } finally {
      setImageUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (submitting) return;
    
    setError(null);
    setSubmitting(true);

    // Validation
    if (!form.name.trim()) {
      logger.warn('[TEACHER_FORM]', 'Validation failed: Full Name is required');
      setError('Full Name is required');
      setSubmitting(false);
      return;
    }
    
    if (!form.teacherId.trim()) {
      logger.warn('[TEACHER_FORM]', 'Validation failed: Teacher ID is required');
      setError('Teacher ID is required');
      setSubmitting(false);
      return;
    }
    
    if (!form.cnic.trim()) {
      logger.warn('[TEACHER_FORM]', 'Validation failed: CNIC is required');
      setError('CNIC is required');
      setSubmitting(false);
      return;
    }

    // Normalize CNIC: remove non-digit characters and ensure 13 digits
    const sanitizedCnic = form.cnic.replace(/\D/g, '');
    if (sanitizedCnic.length !== 13) {
      logger.warn('[TEACHER_FORM]', `Validation failed: CNIC length invalid (${sanitizedCnic.length} digits, expected 13)`);
      setError('CNIC must be 13 digits (no dashes)');
      setSubmitting(false);
      return;
    }

    try {
      // Build assigned_classes array
      const assigned_classes = classAssignments
        .filter(a => a.class_name)
        .map(a => a.section ? `${a.class_name}-${a.section}` : a.class_name);

      // Build assigned_subjects array (flatten all subjects from all classes)
      const assigned_subjects = Array.from(new Set(
        classAssignments.flatMap(a => a.subjects)
      ));

      const payload = {
        name: form.name.trim(),
        teacherId: form.teacherId.trim() || undefined,
        cnic: sanitizedCnic || undefined,
        assigned_classes,
        assigned_subjects,
        email: form.email || null,
        phone: form.phone || null,
        qualification: form.qualification || null,
        experience: form.experience || null,
        dateOfJoining: form.dateOfJoining || new Date().toISOString().split('T')[0],
      } as any;

      if (teacher && teacher.id) {
        // Update existing teacher
        logger.info('[TEACHER_FORM]', `Updating teacher - ID: "${teacher.id}" (type: ${typeof teacher.id})`);
        
        await apiCallJSON(`/teachers/${teacher.id}`, {
          method: 'PUT',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        
        logger.info('[TEACHER_FORM]', '✅ Teacher update API call succeeded');
        
        // Upload image if new one was selected
        if (inlineImageFile) {
          try {
            await uploadTeacherImage(teacher.id, inlineImageFile);
          } catch (err) {
            logger.warn('[TEACHER_FORM]', `Image upload failed (teacher already updated): ${String(err)}`);
          }
        }
        
        entitySync.emitTeacherUpdated(teacher.id, payload);
        setSuccess(true);
        onTeacherUpdated?.();
        setTimeout(() => {
          setSuccess(false);
          handleClose();
        }, 900);
      } else {
        // Create new teacher
        logger.info('[TEACHER_FORM]', 'Creating new teacher');
        
        const response = await apiCallJSON('/teachers', {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        
        const createdId = response.id || response._id;
        logger.info('[TEACHER_FORM]', `✅ Teacher created - New ID: "${createdId}"`);
        
        // Upload image if one was selected
        if (inlineImageFile && createdId) {
          try {
            await uploadTeacherImage(createdId, inlineImageFile);
          } catch (err) {
            // Image upload failed but teacher was created
            setInlineError('Teacher created but image upload failed');
          }
        }
        
        entitySync.emitTeacherCreated(createdId, response);
        setSuccess(true);
        onTeacherAdded?.();
        
        // Auto-close after success
        setTimeout(() => {
          setSuccess(false);
          handleClose();
        }, 1200);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to save teacher';
      logger.error(`[TEACHER_FORM] ❌ Error saving teacher: ${errorMsg}`, err);
      setError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting && !imageUploading) {
      setForm({ ...initialForm });
      setClassAssignments([]);
      setError(null);
      setSuccess(false);
      setInlineError(null);
      // Cleanup camera and preview
      if (inlineVideoRef.current?.srcObject) {
        (inlineVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      if (inlineStream) {
        inlineStream.getTracks().forEach(t => t.stop());
      }
      if (inlinePreviewUrl && inlinePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(inlinePreviewUrl);
      }
      setInlinePreviewUrl(null);
      setInlineImageFile(null);
      setShowInlineCamera(false);
      setInlineStream(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={teacher ? 'Edit Teacher' : 'Add New Teacher'} size="xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            ✅ {teacher ? 'Updated' : 'Added'} successfully!
          </div>
        )}

        {/* Main Form Layout - Left: Form Fields, Right: Photo Upload */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Row 1: Full Name & Teacher ID (Required) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Enter teacher's full name"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Teacher ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="teacherId"
                  value={form.teacherId}
                  onChange={handleChange}
                  placeholder="e.g., TCH-001"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                  required
                />
              </div>
            </div>

            {/* Row 2: CNIC (Required) & Phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  CNIC <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="cnic"
                  value={form.cnic}
                  onChange={handleChange}
                  placeholder="e.g., 1234512345671 (digits only)"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                  required
                />
                <p className="text-xs text-secondary-500 mt-1">Enter CNIC without dashes (13 digits, e.g., 1234512345671)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="Phone number"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                />
              </div>
            </div>

            {/* Row 3: Email & Qualification */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="Email address"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Qualification</label>
                <input
                  type="text"
                  name="qualification"
                  value={form.qualification}
                  onChange={handleChange}
                  placeholder="e.g., M.Ed, B.Sc"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                />
              </div>
            </div>

            {/* Row 4: Experience & Date of Joining */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Experience</label>
                <input
                  type="text"
                  name="experience"
                  value={form.experience}
                  onChange={handleChange}
                  placeholder="e.g., 5 years"
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Date of Joining</label>
                <input
                  type="date"
                  name="dateOfJoining"
                  value={form.dateOfJoining}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Photo Upload (1/3 width) - Like Student Form */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              <label className="block text-sm font-medium text-secondary-700 mb-2">Teacher Photo (optional)</label>
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
                          if (inlinePreviewUrl && inlinePreviewUrl.startsWith('blob:')) {
                            URL.revokeObjectURL(inlinePreviewUrl);
                          }
                          setInlinePreviewUrl(null);
                        }}>
                          Remove Photo
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="primary" size="sm" className="w-full" onClick={captureFromCamera}>
                        Capture
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="w-full" onClick={stopInlineCamera}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>

                <div className="mt-3 text-xs text-secondary-500 text-center">
                  Photos enable automatic face attendance enrollment
                </div>

                <input
                  ref={inlineFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (!f.type.startsWith('image/')) {
                      setInlineError('Please select an image');
                      return;
                    }
                    if (f.size > 10 * 1024 * 1024) {
                      setInlineError('Image too large (max 10MB)');
                      return;
                    }
                    setInlineImageFile(f);
                    const url = URL.createObjectURL(f);
                    if (inlinePreviewUrl && inlinePreviewUrl.startsWith('blob:')) {
                      URL.revokeObjectURL(inlinePreviewUrl);
                    }
                    setInlinePreviewUrl(url);
                    setInlineError(null);
                    // Stop camera if running
                    if (inlineVideoRef.current?.srcObject) {
                      (inlineVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
                    }
                    setShowInlineCamera(false);
                    if (inlineStream) {
                      inlineStream.getTracks().forEach(t => t.stop());
                    }
                    setInlineStream(null);
                  }}
                />
                <canvas ref={inlineCanvasRef} className="hidden" />
              </div>
            </div>
          </div>
        </div>

        {/* Class & Subject Assignments */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg text-gray-800">Class & Subject Assignments</h3>
            <Button variant="secondary" size="sm" type="button" onClick={addClassAssignment}>
              <Plus className="w-4 h-4 mr-1" /> Add Class
            </Button>
          </div>

          {classAssignments.length === 0 ? (
            <div className="text-sm text-gray-500 italic py-4 text-center bg-gray-50 rounded-lg border border-dashed">
              No classes assigned. Click "Add Class" to assign classes and subjects.
            </div>
          ) : (
            <div className="space-y-4">
              {classAssignments.map((assignment, index) => (
                <div key={index} className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg border border-amber-200">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-medium text-sm text-amber-900">Assignment {index + 1}</h4>
                    <button
                      type="button"
                      onClick={() => removeClassAssignment(index)}
                      className="text-red-600 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Class</label>
                      <select
                        value={assignment.class_name}
                        onChange={(e) => updateClassAssignment(index, 'class_name', e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-white text-sm"
                      >
                        <option value="">Select class</option>
                        {uniqueClassNames.map((cls) => (
                          <option key={cls} value={cls}>{cls}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Section</label>
                      <select
                        value={assignment.section}
                        onChange={(e) => updateClassAssignment(index, 'section', e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-white text-sm"
                        disabled={!assignment.class_name}
                      >
                        <option value="">Select section</option>
                        {assignment.class_name && getSectionsForClass(assignment.class_name).map((section) => (
                          <option key={section} value={section}>{section}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Subjects for this class</label>
                    <div className="flex flex-wrap gap-2">
                      {availableSubjects.length === 0 ? (
                        <span className="text-xs text-gray-500 italic">No subjects available</span>
                      ) : (
                        availableSubjects.map((subject) => {
                          const subjectId = subject.id || subject._id || subject.subject_code;
                          const subjectName = subject.subject_name || subject.name || subjectId;
                          const isSelected = assignment.subjects.includes(subjectId);

                          return (
                            <button
                              key={subjectId}
                              type="button"
                              onClick={() => toggleSubject(index, subjectId)}
                              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                isSelected
                                  ? 'bg-amber-600 text-white border-amber-700'
                                  : 'bg-white text-gray-700 border border-gray-300 hover:border-amber-400'
                              }`}
                            >
                              {subjectName}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form Action Buttons */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-secondary-200">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={submitting || imageUploading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || imageUploading}
          >
            {submitting || imageUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {imageUploading ? 'Uploading Image...' : 'Saving...'}
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                {teacher ? 'Save Changes' : 'Add Teacher'}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddTeacherModal;
