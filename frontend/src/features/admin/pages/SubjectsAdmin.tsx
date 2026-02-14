import React, { useEffect, useState } from 'react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import AdminList from '../../../components/AdminList';
import api from '../../../utils/api';

type Subject = {
  _id?: string;
  name?: string;
  code?: string;
  class_assigned?: string;
};

const SubjectsAdmin: React.FC = () => {
  const [items, setItems] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Subject | null>(null);
  const [form, setForm] = useState({ name: '', code: '', classAssigned: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchSubjects = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/subjects');
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubjects(); }, []);

  const openAdd = () => {
    setForm({ name: '', code: '', classAssigned: '' });
    setCurrent(null);
    setIsEditing(false);
    setShowModal(true);
    setError('');
  };

  const openEdit = (s: Subject) => {
    setForm({ name: s.name || '', code: s.code || '', classAssigned: s.class_assigned || '' });
    setCurrent(s);
    setIsEditing(true);
    setShowModal(true);
    setError('');
  };

  const handleSave = async () => {
    if (!form.name) return setError('Name required');
    setError('');
    try {
      const payload = { name: form.name, code: form.code, class_assigned: form.classAssigned };
      
      if (isEditing && current?._id) {
        await api.put(`/api/subjects/${current._id}`, payload);
      } else {
        await api.post('/api/subjects', payload);
      }
      
      setSuccess(isEditing ? 'Subject updated' : 'Subject created');
      setShowModal(false);
      fetchSubjects();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    }
  };

  const handleDelete = async (id?: string, name?: string) => {
    if (!id) return;
    if (!confirm(`Delete subject ${name ?? id}?`)) return;
    try {
      await api.delete(`/api/subjects/${id}`);
      setSuccess('Subject deleted');
      fetchSubjects();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Subjects — Admin</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchSubjects}>Refresh</Button>
          <Button onClick={openAdd}>Add Subject</Button>
        </div>
      </div>

      {error && <div className="mb-4 text-danger-700">{error}</div>}
      {success && <div className="mb-4 text-success-700">{success}</div>}

      <AdminList
        items={items}
        loading={loading}
        onRefresh={fetchSubjects}
        onCreate={openAdd}
        searchFields={[ 'name', 'code', 'class_assigned' ]}
        pageSize={10}
        renderItem={(s) => (
          <div className="p-3 border rounded flex items-center justify-between">
            <div>
              <div className="font-medium">{s.name} {s.code ? <span className="text-sm text-gray-500">({s.code})</span> : null}</div>
              <div className="text-sm text-gray-500">Class: {s.class_assigned ?? '—'}</div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => openEdit(s)}>Edit</Button>
              <Button variant="danger" onClick={() => handleDelete(s._id, s.name)}>Delete</Button>
            </div>
          </div>
        )}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={isEditing ? 'Edit Subject' : 'Add Subject'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 p-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Code</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full mt-1 p-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Class Assigned</label>
            <input value={form.classAssigned} onChange={(e) => setForm({ ...form, classAssigned: e.target.value })} className="w-full mt-1 p-2 border rounded" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave}>{isEditing ? 'Update' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SubjectsAdmin;
