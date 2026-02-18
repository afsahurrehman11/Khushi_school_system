import React, { useState, useEffect } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { Loader2 } from 'lucide-react';
import { createClass, updateClass } from '../services/classesApi';
import { getSubjects } from '../../subjects/services/subjectsApi';
import api from '../../../utils/api';
import logger from '../../../utils/logger';

interface Assignment { subject_id?: string; teacher_id?: string; time?: string }
interface Props { isOpen: boolean; onClose: () => void; cls?: any; onSaved?: () => void; }

const AddClassModal: React.FC<Props> = ({ isOpen, onClose, cls, onSaved }) => {
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [capacity, setCapacity] = useState('');
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    if (cls) {
      setName(cls.class_name || cls.name || '');
      setSection(cls.section || '');
      setCapacity(String(cls.capacity || ''));
      setAssignments(Array.isArray(cls.assigned_subjects) ? cls.assigned_subjects.map((a: any) => ({ subject_id: a.subject_id || a, teacher_id: a.teacher_id || undefined, time: a.time || '' })) : []);
    } else {
      setName(''); setSection(''); setCapacity(''); setAssignments([]);
    }
  }, [cls, isOpen]);

  useEffect(() => {
    (async () => {
      try {
        const s = await getSubjects();
        setSubjects(Array.isArray(s) ? s : []);
      } catch (err) { setSubjects([]); }
      try {
        const t = await api.get('/api/teachers');
        setTeachers(Array.isArray(t) ? t : []);
      } catch (err) { setTeachers([]); }
    })();
  }, [isOpen]);

  if (!isOpen) return null;

  const addAssignment = () => setAssignments((s) => [...s, { subject_id: '', teacher_id: '', time: '' }]);
  const removeAssignment = (idx: number) => setAssignments((s) => s.filter((_, i) => i !== idx));
  const setAssignmentField = (idx: number, field: keyof Assignment, value: any) => setAssignments((s) => s.map((a, i) => i === idx ? { ...a, [field]: value } : a));

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        class_name: name.trim(),
        section: section.trim() || undefined,
        capacity: capacity ? Number(capacity) : undefined,
        assigned_subjects: assignments.map(a => ({ subject_id: a.subject_id, teacher_id: a.teacher_id, time: a.time }))
      };

      if (cls && (cls.id || cls._id)) {
        const id = cls.id || cls._id;
        await updateClass(id, payload);
      } else {
        await createClass(payload);
      }
      onSaved?.(); onClose();
    } catch (err) {
      logger.error('CLASSMODAL', `Error saving class: ${String(err)}`);
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cls ? 'Edit Class' : 'Add Class'} size="lg">
      <form onSubmit={handle} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Section</label>
            <input value={section} onChange={(e) => setSection(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Capacity</label>
            <input value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Subject Assignments</h3>
            <Button variant="secondary" size="sm" onClick={(e:any) => { e.preventDefault(); addAssignment(); }}>Add Assignment</Button>
          </div>
          <div className="mt-3 space-y-2">
            {assignments.map((a, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select className="col-span-4 p-2 border rounded" value={a.subject_id || ''} onChange={(e) => setAssignmentField(idx, 'subject_id', e.target.value)}>
                  <option value="">Select subject</option>
                  {subjects.map((s:any) => <option key={s.id || s._id} value={s.id || s._id}>{s.subject_name || s.name || s.subject_code || s.id}</option>)}
                </select>
                <select className="col-span-4 p-2 border rounded" value={a.teacher_id || ''} onChange={(e) => setAssignmentField(idx, 'teacher_id', e.target.value)}>
                  <option value="">Select teacher</option>
                  {teachers.map((t:any) => <option key={t.id || t._id} value={t.id || t._id}>{t.name || t.fullName || t.teacherId || t.id}</option>)}
                </select>
                <input className="col-span-3 p-2 border rounded" placeholder="Time (e.g. Mon 09:00)" value={a.time || ''} onChange={(e) => setAssignmentField(idx, 'time', e.target.value)} />
                <div className="col-span-1 text-right">
                  <Button variant="danger" size="sm" onClick={(e:any) => { e.preventDefault(); removeAssignment(idx); }}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={saving}>{saving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Saving...</>) : (cls ? 'Save' : 'Create')}</Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddClassModal;