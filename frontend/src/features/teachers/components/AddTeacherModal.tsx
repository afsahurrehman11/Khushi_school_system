import React, { useState, useEffect } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { apiCallJSON, getAuthHeaders } from '../../../utils/api';

interface AddTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTeacherAdded?: () => void;
  teacher?: any; // for edit
  onTeacherUpdated?: () => void;
}

const initialForm = {
  name: '',
  teacherId: '',
  cnic: '',
  subjects: '',
  email: '',
  phone: '',
  qualification: '',
  experience: '',
  dateOfJoining: new Date().toISOString().split('T')[0],
};

const AddTeacherModal: React.FC<AddTeacherModalProps> = ({ isOpen, onClose, onTeacherAdded, teacher, onTeacherUpdated }) => {
  const [form, setForm] = useState({ ...initialForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (teacher) {
      setForm({
        name: teacher.name || '',
        teacherId: teacher.teacherId || teacher.id || '',
        cnic: teacher.cnic || '',
        subjects: (teacher.subjects || []).join(', '),
        email: teacher.email || '',
        phone: teacher.phone || '',
        qualification: teacher.qualification || '',
        experience: teacher.experience || '',
        dateOfJoining: teacher.dateOfJoining ? new Date(teacher.dateOfJoining).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      });
    } else {
      setForm({ ...initialForm });
    }
  }, [teacher, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
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
      const payload = {
        name: form.name.trim(),
        teacherId: form.teacherId.trim() || undefined,
        cnic: form.cnic.trim() || undefined,
        subjects: form.subjects.split(',').map((s) => s.trim()).filter(Boolean),
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
        setSuccess(true);
        onTeacherUpdated?.();
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 900);
      } else {
        await apiCallJSON('/api/teachers', {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        setSuccess(true);
        onTeacherAdded?.();
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 900);
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
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={teacher ? 'Edit Teacher' : 'Add New Teacher'} size="lg">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Full Name</label>
            <input name="name" value={form.name} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Email</label>
            <input name="email" value={form.email} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Phone</label>
            <input name="phone" value={form.phone} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-1">Subjects (comma separated)</label>
          <input name="subjects" value={form.subjects} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Qualification</label>
            <input name="qualification" value={form.qualification} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Experience</label>
            <input name="experience" value={form.experience} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">Date of Joining</label>
            <input type="date" name="dateOfJoining" value={form.dateOfJoining} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg" />
          </div>
        </div>

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
      </form>
    </Modal>
  );
};

export default AddTeacherModal;
