import React, { useState, useEffect } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { Loader2 } from 'lucide-react';
import { createSubject, updateSubject } from '../services/subjectsApi';
import { getClasses, createClass } from '../../classes/services/classesApi';
import { entitySync } from '../../../utils/entitySync';
import api from '../../../utils/api';
import logger from '../../../utils/logger';

interface Assignment { class_id?: string; class_name?: string; section?: string; teacher_id?: string }
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
      setAssignments(Array.isArray(subject.assigned_classes) ? subject.assigned_classes.map((a:any) => ({ class_id: a.class_id || '', class_name: a.class_name || a.class, section: a.section || '', teacher_id: a.teacher_id || a.teacher })) : []);
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
      try {
        // fetch teachers fresh for the current school context
        const t = await api.get('/api/teachers');
        setTeachers(Array.isArray(t) ? t : []);
      } catch {
        setTeachers([]);
      }
    })();
  }, [isOpen]);

  // derive options from fetched classes (class + section combined)
  const classOptions = _classes.map((c:any) => ({
    id: c.id || c._id,
    label: `${(c.class_name||c.name||'').trim()}${c.section ? ` - ${c.section}` : ''}`,
    class_name: c.class_name || c.name || '',
    section: c.section || ''
  }));

  if (!isOpen) return null;

  const addAssignment = () => setAssignments((s) => [...s, { class_id: '', class_name: '', section: '', teacher_id: '' }]);
  const removeAssignment = (i:number) => setAssignments((s) => s.filter((_,idx)=>idx!==i));
  const setAssignment = (i:number, field:keyof Assignment, value:any) => setAssignments(s => s.map((a,idx)=> idx===i ? { ...a, [field]: value } : a));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Name required');
    setSaving(true);
    try {
      const payload:any = { subject_name: name.trim(), subject_code: code.trim() || undefined, assigned_classes: assignments.map(a => ({ class_name: a.class_name, section: a.section, teacher_id: a.teacher_id })) };
      if (subject && (subject.id || subject._id)) {
        const id = subject.id || subject._id;
        await updateSubject(id, payload);
        entitySync.emitSubjectUpdated(id, payload);
      } else {
        const response = await createSubject(payload);
        entitySync.emitSubjectCreated(response.id || response._id, response);
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
      logger.error('SUBJECTS', `Failed saving subject: ${String(err)}`);
      setError(err?.message || JSON.stringify(err) || 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={subject ? 'Edit Subject' : 'Add Subject'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-sm text-danger-700">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Subject Name</label>
            <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium">Code (optional)</label>
            <input value={code} onChange={(e)=>setCode(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Assignments (Class - Section / Teacher)</h3>
            <Button variant="secondary" size="sm" onClick={(e:any)=>{ e.preventDefault(); addAssignment(); }}>Add Assignment</Button>
          </div>
          <div className="mt-2 p-3 border rounded bg-white shadow-sm">
          <div className="mt-3 space-y-3">
            {assignments.map((a, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  className="col-span-5 p-2 border rounded"
                  value={a.class_id || ''}
                  onChange={(e)=>{
                    const sel = classOptions.find(co => String(co.id) === String(e.target.value));
                    if (sel) setAssignment(idx, 'class_id', sel.id);
                    setAssignment(idx, 'class_name', sel ? sel.class_name : '');
                    setAssignment(idx, 'section', sel ? sel.section : '');
                  }}
                >
                  <option value="">Select class - section</option>
                  {classOptions.map((cn:any) => <option key={cn.id} value={cn.id}>{cn.label}</option>)}
                </select>

                <select className="col-span-5 p-2 border rounded" value={a.teacher_id||''} onChange={(e)=>setAssignment(idx,'teacher_id', e.target.value)}>
                  <option value="">Select teacher</option>
                  {teachers.map((t:any)=> <option key={t.id || t._id} value={t.id || t._id}>{t.name || t.fullName || t.teacherId || t.id}</option>)}
                </select>

                <div className="col-span-2 text-right"><Button variant="danger" size="sm" onClick={(e:any)=>{ e.preventDefault(); removeAssignment(idx); }}>Remove</Button></div>
              </div>
            ))}
          </div>
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
