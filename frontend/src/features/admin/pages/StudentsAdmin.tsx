import React, { useEffect, useState } from 'react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import AdminList from '../../../components/AdminList';
import api from '../../../utils/api';
import ImportModal from '../../students/components/ImportModal';
import ExportModal from '../../students/components/ExportModal';
import { Download, Upload } from 'lucide-react';

type Student = {
  _id?: string;
  name?: string;
  roll?: string;
  class?: string;
};

const StudentsAdmin: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Student | null>(null);
  const [form, setForm] = useState({ name: '', roll: '', className: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/students');
      setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const openAdd = () => {
    setForm({ name: '', roll: '', className: '' });
    setCurrent(null);
    setIsEditing(false);
    setShowModal(true);
    setError('');
  };

  const openEdit = (s: Student) => {
    setForm({ name: s.name || '', roll: s.roll || '', className: s.class || '' });
    setCurrent(s);
    setIsEditing(true);
    setShowModal(true);
    setError('');
  };

  const handleSave = async () => {
    if (!form.name) return setError('Name is required');
    setError('');
    try {
      const payload = { name: form.name, roll: form.roll, class: form.className };
      
      if (isEditing && current?._id) {
        await api.put(`/api/students/${current._id}`, payload);
      } else {
        await api.post('/api/students', payload);
      }
      
      setSuccess(isEditing ? 'Student updated' : 'Student created');
      setShowModal(false);
      fetchStudents();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    }
  };

  const handleDelete = async (id?: string, name?: string) => {
    if (!id) return;
    if (!confirm(`Delete student ${name ?? id}?`)) return;
    try {
      await api.delete(`/api/students/${id}`);
      setSuccess('Student deleted');
      fetchStudents();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Students — Admin</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchStudents}>Refresh</Button>
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button variant="secondary" onClick={() => setExportOpen(true)}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={openAdd}>Add Student</Button>
        </div>
      </div>

      {error && <div className="mb-4 text-danger-700">{error}</div>}
      {success && <div className="mb-4 text-success-700">{success}</div>}

      <AdminList
        items={students}
        loading={loading}
        onRefresh={fetchStudents}
        onCreate={openAdd}
        searchFields={[ 'name', 'roll', 'class' ]}
        pageSize={10}
        renderItem={(s) => (
          <div className="p-3 border rounded flex items-center justify-between">
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-sm text-gray-500">Roll: {s.roll ?? '—'} • Class: {s.class ?? '—'}</div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => openEdit(s)}>Edit</Button>
              <Button variant="danger" onClick={() => handleDelete(s._id, s.name)}>Delete</Button>
            </div>
          </div>
        )}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={isEditing ? 'Edit Student' : 'Add Student'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full mt-1 p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Roll</label>
            <input
              value={form.roll}
              onChange={(e) => setForm({ ...form, roll: e.target.value })}
              className="w-full mt-1 p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Class</label>
            <input
              value={form.className}
              onChange={(e) => setForm({ ...form, className: e.target.value })}
              className="w-full mt-1 p-2 border rounded"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{isEditing ? 'Update' : 'Create'}</Button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImportComplete={(_importId: string) => {
          setImportOpen(false);
          fetchStudents();
        }}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
};

export default StudentsAdmin;
