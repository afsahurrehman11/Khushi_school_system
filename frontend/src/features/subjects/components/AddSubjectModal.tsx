import React, { useState, useEffect } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { Loader2 } from 'lucide-react';
import { createSubject, updateSubject } from '../services/subjectsApi';
import { getClasses, createClass } from '../../classes/services/classesApi';
import api from '../../../utils/api';

interface Assignment { class_name?: string; section?: string; teacher_id?: string; time?: string }
interface Props { isOpen: boolean; onClose: () => void; subject?: any; onSaved?: () => void; }

const AddSubjectModal: React.FC<Props> = ({ isOpen, onClose, subject, onSaved }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [_classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  useEffect(() => {
    if (subject) {
      setName(subject.subject_name || subject.name || '');
      setCode(subject.subject_code || subject.code || '');
      setAssignments(Array.isArray(subject.assigned_classes) ? subject.assigned_classes.map((a:any) => ({ class_name: a.class_name || a.class, section: a.section || '', teacher_id: a.teacher_id || a.teacher, time: a.time || '' })) : []);
    } else {
      setName(''); setCode(''); setAssignments([]);
    }
  }, [subject, isOpen]);

  useEffect(() => {
    (async () => {
      try {
        const c = await getClasses();
        setClasses(Array.isArray(c) ? c : []);
      } catch {
        setClasses([]);
      }
      try { const t = await api.get('/api/teachers'); setTeachers(Array.isArray(t) ? t : []); } catch { setTeachers([]); }
    })();
  }, [isOpen]);

  // fixed Grade 1..Grade 10 options
  const classOptions = Array.from({ length: 10 }, (_, i) => `Grade ${i + 1}`);

  if (!isOpen) return null;

  const addAssignment = () => setAssignments((s) => [...s, { class_name: '', section: '', teacher_id: '', time: '' }]);
  const removeAssignment = (i:number) => setAssignments((s) => s.filter((_,idx)=>idx!==i));
  const setAssignment = (i:number, field:keyof Assignment, value:any) => setAssignments(s => s.map((a,idx)=> idx===i ? { ...a, [field]: value } : a));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Name required');
    setSaving(true);
    try {
      const payload:any = { subject_name: name.trim(), subject_code: code.trim() || undefined, assigned_classes: assignments.map(a => ({ class_name: a.class_name, section: a.section, teacher_id: a.teacher_id, time: a.time })) };
      if (subject && (subject.id || subject._id)) {
        const id = subject.id || subject._id;
        await updateSubject(id, payload);
      } else {
        await createSubject(payload);
      }
      // ensure classes exist in DB for each assignment (create if missing)
      try {
        const existing = await getClasses().catch(() => []);
        const existingSet = new Set((Array.isArray(existing) ? existing : []).map((c:any) => `${(c.class_name||c.name||'').trim()}::${(c.section||'').trim()}`));
        const toCreate = assignments.map(a => ({ class_name: a.class_name || '', section: a.section || '' }))
          .filter(a => a.class_name)
          .filter(a => !existingSet.has(`${a.class_name.trim()}::${(a.section||'').trim()}`));
        await Promise.all(toCreate.map(tc => createClass({ class_name: tc.class_name, section: tc.section }).catch(()=>null)));
      } catch (e) {
        // Auto-create failed, but continue
      }

      onSaved?.(); onClose();
    } catch (err:any) {
      console.error('Failed saving subject', err);
      setError(err?.message || JSON.stringify(err) || 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={subject ? 'Edit Subject' : 'Add Subject'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-sm text-danger-700">{error}</div>}
        <div>
          <label className="block text-sm font-medium">Subject Name</label>
          <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full px-3 py-2 border rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium">Code (optional)</label>
          <input value={code} onChange={(e)=>setCode(e.target.value)} className="w-full px-3 py-2 border rounded" />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Assignments (class / section / teacher / time)</h3>
            <Button variant="secondary" size="sm" onClick={(e:any)=>{ e.preventDefault(); addAssignment(); }}>Add Assignment</Button>
          </div>
          <div className="mt-3 space-y-2">
            {assignments.map((a, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select className="col-span-3 p-2 border rounded" value={a.class_name || ''} onChange={(e)=>setAssignment(idx,'class_name', e.target.value)}>
                  <option value="">Select class</option>
                  {classOptions.map((cn:any, i:number) => <option key={cn + String(i)} value={cn}>{cn}</option>)}
                </select>
                <input className="col-span-2 p-2 border rounded" placeholder="Section" value={a.section||''} onChange={(e)=>setAssignment(idx,'section', e.target.value)} />
                <select className="col-span-4 p-2 border rounded" value={a.teacher_id||''} onChange={(e)=>setAssignment(idx,'teacher_id', e.target.value)}>
                  <option value="">Select teacher</option>
                  {teachers.map((t:any)=> <option key={t.id || t._id} value={t.id || t._id}>{t.name || t.fullName || t.teacherId || t.id}</option>)}
                </select>
                <input className="col-span-2 p-2 border rounded" placeholder="Time" value={a.time||''} onChange={(e)=>setAssignment(idx,'time', e.target.value)} />
                <div className="col-span-1 text-right"><Button variant="danger" size="sm" onClick={(e:any)=>{ e.preventDefault(); removeAssignment(idx); }}>Remove</Button></div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={saving}>{saving ? (<><Loader2 className="w-4 h-4 animate-spin mr-2"/>Saving...</>) : (subject ? 'Save' : 'Create')}</Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddSubjectModal;
