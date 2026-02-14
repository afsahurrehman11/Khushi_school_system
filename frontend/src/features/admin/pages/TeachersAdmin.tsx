import React, { useEffect, useState } from 'react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import AdminList from '../../../components/AdminList';
import api from '../../../utils/api';

type Teacher = {
  _id?: string;
  name?: string;
  subject?: string;
  email?: string;
  assigned_classes?: string[];
  assigned_subjects?: string[];
  branch_code?: string;
};

const TeachersAdmin: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Teacher | null>(null);
  const [form, setForm] = useState<any>({ name: '', subject: '', email: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [classes, setClasses] = useState<Array<{ _id: string; class_name?: string; section?: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ _id: string; name?: string; subject_code?: string }>>([]);

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/teachers');
      setTeachers(Array.isArray(data) ? data : []);
    } catch (err) {
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassesAndSubjects = async () => {
    try {
      const [cData, sData] = await Promise.all([
        api.get('/api/classes').catch(() => []),
        api.get('/api/subjects').catch(() => []),
      ]);
      setClasses(Array.isArray(cData) ? cData : []);
      setSubjects(Array.isArray(sData) ? sData : []);
    } catch (e) {
      setClasses([]);
      setSubjects([]);
    }
  };

  useEffect(() => {
    fetchTeachers();
    fetchClassesAndSubjects();
  }, []);

  const openAdd = () => {
    setForm({ name: '', subject: '', email: '', assigned_classes: [], assigned_subjects: [], branch_code: 'MAIN' });
    setCurrent(null);
    setIsEditing(false);
    setShowModal(true);
    setError('');
  };

  const openEdit = (t: Teacher) => {
    setForm({
      name: t.name || '',
      subject: t.subject || '',
      email: t.email || '',
      assigned_classes: t.assigned_classes || [],
      assigned_subjects: t.assigned_subjects || [],
      branch_code: t.branch_code || 'MAIN',
    });
    setCurrent(t);
    setIsEditing(true);
    setShowModal(true);
    setError('');
  };

  const handleSave = async () => {
    if (!form.name) return setError('Name is required');
    setError('');
    try {
      const payload: any = {
        name: form.name,
        email: form.email,
        assigned_classes: form.assigned_classes || [],
        assigned_subjects: form.assigned_subjects || [],
        branch_code: form.branch_code || 'MAIN',
      };
      
      if (isEditing && current?._id) {
        await api.put(`/api/teachers/${current._id}`, payload);
      } else {
        await api.post('/api/teachers', payload);
      }
      
      setSuccess(isEditing ? 'Teacher updated' : 'Teacher created');
      setShowModal(false);
      fetchTeachers();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    }
  };

  const handleDelete = async (id?: string, name?: string) => {
    if (!id) return;
    if (!confirm(`Delete teacher ${name ?? id}?`)) return;
    try {
      await api.delete(`/api/teachers/${id}`);
      setSuccess('Teacher deleted');
      fetchTeachers();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Teachers — Admin</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchTeachers}>Refresh</Button>
          <Button onClick={openAdd}>Add Teacher</Button>
        </div>
      </div>

      {error && <div className="mb-4 text-danger-700">{error}</div>}
      {success && <div className="mb-4 text-success-700">{success}</div>}

      <AdminList
        items={teachers}
        loading={loading}
        onRefresh={fetchTeachers}
        onCreate={openAdd}
        searchFields={[ 'name', 'subject', 'email' ]}
        pageSize={10}
        renderItem={(t) => (
          <div className="p-3 border rounded flex items-center justify-between">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-sm text-gray-500">
                {t.assigned_subjects && t.assigned_subjects.length > 0 ? `Subjects: ${t.assigned_subjects.join(', ')}` : `Subject: ${t.subject ?? '—'}`}
                {' • '}
                {t.email ?? ''}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => openEdit(t)}>Edit</Button>
              <Button variant="danger" onClick={() => handleDelete(t._id, t.name)}>Delete</Button>
            </div>
          </div>
        )}
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={isEditing ? 'Edit Teacher' : 'Add Teacher'}>
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
            <label className="block text-sm font-medium">Classes (assign)</label>
            <select
              multiple
              value={form.assigned_classes || []}
              onChange={(e) => {
                const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                setForm({ ...form, assigned_classes: opts });
              }}
              className="w-full mt-1 p-2 border rounded"
            >
              {classes.map((c) => (
                <option key={c._id} value={c._id}>{c.class_name}{c.section ? ` - ${c.section}` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Subjects (assign)</label>
            <select
              multiple
              value={form.assigned_subjects || []}
              onChange={(e) => {
                const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                setForm({ ...form, assigned_subjects: opts });
              }}
              className="w-full mt-1 p-2 border rounded"
            >
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>{s.name || s.subject_code || s._id}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Branch Code</label>
            <input
              value={form.branch_code || 'MAIN'}
              onChange={(e) => setForm({ ...form, branch_code: e.target.value })}
              className="w-full mt-1 p-2 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full mt-1 p-2 border rounded"
            />
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

export default TeachersAdmin;
