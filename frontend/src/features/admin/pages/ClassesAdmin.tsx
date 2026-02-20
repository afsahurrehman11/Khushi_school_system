import React, { useEffect, useState } from 'react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import AdminList from '../../../components/AdminList';
import api from '../../../utils/api';

type ClassRoom = {
  _id?: string;
  name?: string;
  section?: string;
};

const ClassesAdmin: React.FC = () => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<ClassRoom | null>(null);
  const [form, setForm] = useState({ name: '', section: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/classes');
      setClasses(Array.isArray(data) ? data : []);
    } catch (err) {
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const openAdd = () => {
    setForm({ name: '', section: '' });
    setCurrent(null);
    setIsEditing(false);
    setShowModal(true);
    setError('');
  };

  const openEdit = (c: ClassRoom) => {
    setForm({ name: c.name || '', section: c.section || '' });
    setCurrent(c);
    setIsEditing(true);
    setShowModal(true);
    setError('');
  };

  const handleSave = async () => {
    if (!form.name) return setError('Name is required');
    setError('');
    try {
      const payload = { name: form.name, section: form.section };
      
      if (isEditing && current?._id) {
        await api.put(`/api/classes/${current._id}`, payload);
      } else {
        await api.post('/api/classes', payload);
      }
      
      setSuccess(isEditing ? 'Class updated' : 'Class created');
      setShowModal(false);
      fetchClasses();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    }
  };

  const handleDelete = async (id?: string, name?: string) => {
    if (!id) return;
    if (!confirm(`Delete class ${name ?? id}?`)) return;
    try {
      await api.delete(`/api/classes/${id}`);
      setSuccess('Class deleted');
      fetchClasses();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Classes — Admin</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchClasses}>Refresh</Button>
          <Button onClick={openAdd}>Add Class</Button>
        </div>
      </div>

      {error && <div className="mb-4 text-danger-700">{error}</div>}
      {success && <div className="mb-4 text-success-700">{success}</div>}

      <AdminList
        items={classes}
        loading={loading}
        onRefresh={fetchClasses}
        onCreate={openAdd}
        searchFields={[ 'name', 'section' ]}
        pageSize={10}
        renderItem={(c) => (
          <div className="p-3 border rounded flex items-center justify-between">
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-sm text-gray-500">Section: {c.section ?? '—'}</div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
              <Button variant="danger" onClick={() => handleDelete(c._id, c.name)}>Delete</Button>
            </div>
          </div>
        )}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={isEditing ? 'Edit Class' : 'Add Class'}>
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
            <label className="block text-sm font-medium">Section</label>
            <input
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
              className="w-full mt-1 p-2 border rounded"
            />
          </div>
          {/* capacity removed */}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{isEditing ? 'Update' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ClassesAdmin;
