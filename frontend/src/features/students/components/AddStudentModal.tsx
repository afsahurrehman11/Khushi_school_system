import React, { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { apiCallJSON, getAuthHeaders } from '../../../utils/api';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStudentAdded?: () => void;
  student?: any; // optional initial student for edit
  onStudentUpdated?: () => void;
}

interface FormData {
  full_name: string;
  roll_number: string;
  class_id: string;
  section: string;
  gender: string;
  date_of_birth: string;
  admission_date: string;
  parent_cnic: string;
  parent_name: string;
  parent_contact: string;
  email: string;
  phone: string;
  address: string;
}

const initialFormData: FormData = {
  full_name: '',
  roll_number: '',
  class_id: '',
  section: 'A',
  gender: '',
  date_of_birth: '',
  admission_date: new Date().toISOString().split('T')[0],
  parent_cnic: '',
  parent_name: '',
  parent_contact: '',
  email: '',
  phone: '',
  address: '',
};

const AddStudentModal: React.FC<AddStudentModalProps> = ({ isOpen, onClose, onStudentAdded, student, onStudentUpdated }) => {
  const [formData, setFormData] = useState<FormData>({ ...initialFormData });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
      setError('Parent CNIC is required');
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        full_name: formData.full_name.trim(),
        roll_number: formData.roll_number.trim(),
        class_id: formData.class_id.trim(),
        section: formData.section || 'A',
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
          email: formData.email || null,
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
        setSuccess(true);
        onStudentUpdated?.();
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1200);
      } else {
        await apiCallJSON('/api/students', {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        setSuccess(true);
        setFormData({ ...initialFormData });
        onStudentAdded?.();
        // Auto-close after success
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1200);
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
        section: student.section || 'A',
        gender: student.gender || '',
        date_of_birth: student.dateOfBirth || student.date_of_birth || '',
        admission_date: student.admission_date || new Date().toISOString().split('T')[0],
        parent_cnic: student.parentCnic || student.parent_cnic || (student.guardian_info?.parent_cnic) || '',
        parent_name: student.guardianName || student.parent_name || (student.guardian_info?.father_name) || (student.guardian_info?.mother_name) || '',
        parent_contact: student.guardianPhone || student.parent_contact || (student.guardian_info?.guardian_contact) || '',
        email: student.email || (student.contact_info?.email) || '',
        phone: student.phone || (student.contact_info?.phone) || '',
        address: student.address || (student.guardian_info?.address) || '',
      });
    } else {
      setFormData({ ...initialFormData });
    }
  }, [student, isOpen]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New Student" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            ✅ Student added successfully!
          </div>
        )}

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
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
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
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
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
            <input
              type="text"
              name="class_id"
              value={formData.class_id}
              onChange={handleChange}
              placeholder="e.g. 10"
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Section
            </label>
            <select
              name="section"
              value={formData.section}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              name="date_of_birth"
              value={formData.date_of_birth}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
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
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Row 4: Contact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="student@email.com"
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
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
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Row 5: Guardian CNIC */}
        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-1">
            Parent / Guardian CNIC <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="parent_cnic"
            value={formData.parent_cnic}
            onChange={handleChange}
            placeholder="e.g. 12345-1234567-1"
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            required
          />
        </div>

        {/* Row 6: Guardian Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
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
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
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
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
          <Button variant="ghost" type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Student
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddStudentModal;
