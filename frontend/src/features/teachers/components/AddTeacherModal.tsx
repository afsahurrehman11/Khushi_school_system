import React, { useState, useEffect } from 'react';
import { Loader2, UserPlus, Plus, Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import PersonImageUpload from '../../../components/PersonImageUpload';
import { apiCallJSON, getAuthHeaders } from '../../../utils/api';
import { entitySync } from '../../../utils/entitySync';

interface AddTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTeacherAdded?: () => void;
  teacher?: any; // for edit
  onTeacherUpdated?: () => void;
}

interface ClassAssignment {
  class_name: string;
  section: string;
  subjects: string[];
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
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<any[]>([]);
  const [newTeacherId, setNewTeacherId] = useState<string | null>(null);
  const [showImageUpload, setShowImageUpload] = useState(false);

  // Load classes and subjects
  useEffect(() => {
    if (isOpen) {
      (async () => {
        try {
          const classes = await apiCallJSON('/api/classes');
          setAvailableClasses(Array.isArray(classes) ? classes : []);
        } catch { setAvailableClasses([]); }

        try {
          const subjects = await apiCallJSON('/api/subjects');
          setAvailableSubjects(Array.isArray(subjects) ? subjects : []);
        } catch { setAvailableSubjects([]); }
      })();
    }
  }, [isOpen]);

  useEffect(() => {
    if (teacher) {
      setForm({
        name: teacher.name || '',
        teacherId: teacher.teacherId || teacher.id || '',
        cnic: teacher.cnic || '',
        email: teacher.email || '',
        phone: teacher.phone || '',
        qualification: teacher.qualification || '',
        experience: teacher.experience || '',
        dateOfJoining: teacher.dateOfJoining ? new Date(teacher.dateOfJoining).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      });

      // Parse existing assignments
      const classes = teacher.assigned_classes || [];
      const subjects = teacher.assigned_subjects || [];
      
      // Group by class
      const assignmentsMap: { [key: string]: ClassAssignment } = {};
      classes.forEach((cls: string) => {
        assignmentsMap[cls] = { class_name: cls, section: '', subjects: [] };
      });

      setClassAssignments(Object.values(assignmentsMap));
    } else {
      setForm({ ...initialForm });
      setClassAssignments([]);
    }
  }, [teacher, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  };

  const addClassAssignment = () => {
    setClassAssignments([...classAssignments, { class_name: '', section: '', subjects: [] }]);
  };

  const removeClassAssignment = (index: number) => {
    setClassAssignments(classAssignments.filter((_, i) => i !== index));
  };

  const updateClassAssignment = (index: number, field: keyof ClassAssignment, value: any) => {
    setClassAssignments(classAssignments.map((a, i) => i === index ? { ...a, [field]: value } : a));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!form.name.trim()) {
      setError('Name is required');
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
        cnic: form.cnic.trim() || undefined,
        assigned_classes,
        assigned_subjects,
        email: form.email || null,
        phone: form.phone || null,
        qualification: form.qualification || null,
        experience: form.experience || null,
        dateOfJoining: form.dateOfJoining || new Date().toISOString().split('T')[0],
      } as any;

      if (teacher && teacher.id) {
        await apiCallJSON(`/api/teachers/${teacher.id}`, {
          method: 'PUT',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        entitySync.emitTeacherUpdated(teacher.id, payload);
        setSuccess(true);
        onTeacherUpdated?.();
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 900);
      } else {
        const response = await apiCallJSON('/api/teachers', {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        entitySync.emitTeacherCreated(response.id || response._id, response);
        setSuccess(true);
        const createdId = response.id || response._id;
        setNewTeacherId(createdId);
        setShowImageUpload(true);
        onTeacherAdded?.();
        // Don't auto-close - let user upload image first
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save teacher');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setForm({ ...initialForm });
      setClassAssignments([]);
      setError(null);
      setSuccess(false);
      setNewTeacherId(null);
      setShowImageUpload(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  // Get class list for dropdown
  const classOptions = Array.from({ length: 10 }, (_, i) => `Grade ${i + 1}`);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={teacher ? 'Edit Teacher' : 'Add New Teacher'} size="xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            ✅ Saved successfully!
          </div>
        )}

        {/* Basic Info */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg text-gray-800">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">Full Name *</label>
              <input name="name" value={form.name} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">Teacher ID</label>
              <input name="teacherId" value={form.teacherId} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">CNIC</label>
              <input name="cnic" value={form.cnic} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">Phone</label>
              <input name="phone" value={form.phone} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">Qualification</label>
              <input name="qualification" value={form.qualification} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">Experience</label>
              <input name="experience" value={form.experience} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" placeholder="e.g., 5 years" />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">Date of Joining</label>
              <input type="date" name="dateOfJoining" value={form.dateOfJoining} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
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
                        {classOptions.map((cls) => (
                          <option key={cls} value={cls}>{cls}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Section</label>
                      <input
                        value={assignment.section}
                        onChange={(e) => updateClassAssignment(index, 'section', e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                        placeholder="e.g., A, B, C"
                      />
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

        {/* Image Upload Section (shown after teacher creation) */}
        {showImageUpload && newTeacherId && (
          <div className="space-y-4 pt-6 border-t border-amber-200">
            <h3 className="font-semibold text-lg text-gray-800">Upload Profile Image</h3>
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <p className="text-sm text-blue-800 mb-2">
                ✨ <strong>Automatic Face Enrollment:</strong> When you upload an image, the teacher will be automatically enrolled in the face attendance system.
              </p>
              <p className="text-xs text-blue-700">
                Make sure the image clearly shows the teacher's face for best results.
              </p>
            </div>
            <PersonImageUpload
              personId={newTeacherId}
              personType="teacher"
              onImageUploaded={() => {
                setTimeout(() => {
                  handleClose();
                }, 1000);
              }}
              showEnrollmentStatus={true}
            />
            <div className="flex justify-end">
              <Button variant="ghost" type="button" onClick={handleClose}>
                Skip & Close
              </Button>
            </div>
          </div>
        )}

        {/* Form action buttons - hide when showing image upload */}
        {!showImageUpload && (
          <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
            <Button variant="ghost" type="button" onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" /> {teacher ? 'Save Changes' : 'Add Teacher'}
              </>
            )}
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
};

export default AddTeacherModal;
