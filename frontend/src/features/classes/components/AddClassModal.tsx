import React, { useState, useEffect } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { Loader2 } from 'lucide-react';
import { createClass, updateClass, getClasses } from '../services/classesApi';
import { getSubjects } from '../../subjects/services/subjectsApi';
import { entitySync } from '../../../utils/entitySync';
import api from '../../../utils/api';
import logger from '../../../utils/logger';

interface Assignment { subject_id?: string; teacher_id?: string }
interface Props { isOpen: boolean; onClose: () => void; cls?: any; onSaved?: () => void; }

const AddClassModal: React.FC<Props> = ({ isOpen, onClose, cls, onSaved }) => {
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentErrors, setAssignmentErrors] = useState<Record<number, { subject?: string; teacher?: string }>>({});
  const [existingClassNames, setExistingClassNames] = useState<string[]>([]);
  const [classSectionsMap, setClassSectionsMap] = useState<Record<string, string[]>>({});
  const [mode, setMode] = useState<'select' | 'new'>('new');
  const [classErrors, setClassErrors] = useState<{ name?: string; section?: string }>({});

  useEffect(() => {
    if (cls) {
      setName(cls.class_name || cls.name || '');
      setSection(cls.section || '');
      setAssignments(Array.isArray(cls.assigned_subjects) ? cls.assigned_subjects.map((a: any) => ({ subject_id: a.subject_id || a, teacher_id: a.teacher_id || undefined })) : []);
      setMode('select');
    } else {
      setName(''); setSection(''); setAssignments([]); setMode('new');
    }
  }, [cls, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    // Note: subjects and teachers are loaded on-demand when the user
    // clicks "Assign Subject & Teacher" to avoid premature/failed fetches
    // while the modal opens. Existing classes are still fetched below.

    // Fetch existing classes
    (async () => {
      try {
        const clsList = await getClasses();
        if (Array.isArray(clsList)) {
          const names: string[] = [];
          const map: Record<string, string[]> = {};
          clsList.forEach((c: any) => {
            const rawName = (c.class_name || c.name || '').trim();
            const cn = rawName;
            const key = rawName.replace(/\s+/g, ' ').trim().toLowerCase();
            const sec = (c.section || '').trim();
            if (!cn) return;
            if (!names.includes(cn)) names.push(cn);
            if (!map[key]) map[key] = [];
            if (sec && !map[key].includes(sec.replace(/\s+/g, ' ').trim().toLowerCase())) map[key].push(sec.replace(/\s+/g, ' ').trim().toLowerCase());
          });
          setExistingClassNames(names);
          setClassSectionsMap(map);
        }
      } catch (err) {
        logger.error('CLASSES', `Failed to fetch existing classes: ${String(err)}`);
        setExistingClassNames([]);
        setClassSectionsMap({});
      }
    })();
  }, [isOpen]);

  // load subjects and teachers on demand (when user clicks Assign)
  const [assignDataLoaded, setAssignDataLoaded] = useState(false);
  const loadAssignData = async () => {
    if (assignDataLoaded) return;
    setLoadingSubjects(true);
    setLoadingTeachers(true);
    try {
      const [sRes, tRes] = await Promise.allSettled([getSubjects(), api.get('/api/teachers')]);
      if (sRes.status === 'fulfilled') {
        const s = sRes.value;
        setSubjects(Array.isArray(s) ? s : []);
        logger.info('CLASSES', `Fetched ${Array.isArray(s) ? s.length : 0} subjects`);
        logger.debug('CLASSES', `Subjects sample: ${Array.isArray(s) ? JSON.stringify(s.slice(0, 3)) : String(s)}`);
      } else {
        logger.error('CLASSES', `Failed to fetch subjects: ${String(sRes.reason)}`);
        setSubjects([]);
      }

      if (tRes.status === 'fulfilled') {
        const t = tRes.value;
        const teacherList = Array.isArray(t) ? t : [];
        setTeachers(teacherList);
        logger.info('CLASSES', `Fetched ${teacherList.length} teachers`);
        logger.debug('CLASSES', `Teachers sample: ${JSON.stringify(teacherList.slice(0, 3))}`);
      } else {
        logger.error('CLASSES', `Failed to fetch teachers: ${String(tRes.reason)}`);
        setTeachers([]);
      }

      setAssignDataLoaded(true);
    } catch (err) {
      logger.error('CLASSES', `Error loading assign data: ${String(err)}`);
      setSubjects([]); setTeachers([]);
    } finally {
      setLoadingSubjects(false);
      setLoadingTeachers(false);
    }
  };

  if (!isOpen) return null;

  const addAssignment = () => setAssignments((s) => [...s, { subject_id: '', teacher_id: '' }]);
  const removeAssignment = (idx: number) => setAssignments((s) => s.filter((_, i) => i !== idx));
  const setAssignmentField = (idx: number, field: keyof Assignment, value: any) => {
    setAssignments((s) => s.map((a, i) => i === idx ? { ...a, [field]: value } : a));
    setAssignmentErrors((prev) => {
      const copy = { ...prev } as Record<number, { subject?: string; teacher?: string }>;
      if (!copy[idx]) return prev;
      if (field === 'subject_id' && value) {
        delete copy[idx].subject;
      }
      if (field === 'teacher_id' && value) {
        delete copy[idx].teacher;
      }
      // if both cleared, remove the index key
      if (copy[idx] && !copy[idx].subject && !copy[idx].teacher) delete copy[idx];
      return copy;
    });
  };

  const validateAssignments = () => {
    const errors: Record<number, { subject?: string; teacher?: string }> = {};
    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      const sid = (a.subject_id || '').toString().trim();
      const tid = (a.teacher_id || '').toString().trim();
      if (!sid && !tid) continue; // empty row allowed
      if (!sid || sid.length === 0) {
        if (!errors[i]) errors[i] = {};
        errors[i].subject = 'Select subject';
      }
      if (!tid || tid.length === 0) {
        if (!errors[i]) errors[i] = {};
        errors[i].teacher = 'Select teacher';
      }
    }
    setAssignmentErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // (form validation handled via explicit validators below)

  // validate class metadata and set UI errors (called on submit)
  const validateClassMeta = () => {
    const errs: { name?: string; section?: string } = {};
    if (!isNonEmptyString(name)) errs.name = 'Enter class name';

    // section is optional now; if supplied, validate uniqueness
    if (isNonEmptyString(section)) {
      const key = normalizeInput(name);
      const secNorm = normalizeInput(section);
      const existingSecs = classSectionsMap[key] || [];
      if (existingSecs.includes(secNorm)) {
        if (!(cls && (cls.section || '').toLowerCase().trim() === secNorm && (cls.class_name || cls.name || '').toLowerCase().trim() === key)) {
          errs.section = 'Section already exists';
        }
      }
    }

    setClassErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // validate class metadata and assignments on submit; show errors only after click
      const classOk = validateClassMeta();
      const assignOk = validateAssignments();
      if (!classOk || !assignOk) {
        setSaving(false);
        return;
      }
      const payload: any = {
        class_name: name.trim(),
        section: section.trim() || undefined,
        assigned_subjects: assignments.map(a => ({ subject_id: a.subject_id, teacher_id: a.teacher_id }))
      };

      if (cls && (cls.id || cls._id)) {
        const id = cls.id || cls._id;
        await updateClass(id, payload);
        entitySync.emitClassUpdated(id, payload);
      } else {
        const response = await createClass(payload);
        entitySync.emitClassCreated(response.id || response._id, response);
      }
      onSaved?.(); onClose();
    } catch (err) {
      logger.error('CLASSMODAL', `Error saving class: ${String(err)}`);
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cls ? 'Edit Class' : 'Add Class'} size="lg">
      <form onSubmit={handle} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Class</label>
          <div className="mt-2 flex items-center gap-4">
            <label className="flex items-center gap-2"><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> <span className="text-sm">Create new</span></label>
            <label className="flex items-center gap-2"><input type="radio" checked={mode === 'select'} onChange={() => setMode('select')} /> <span className="text-sm">Add section to existing</span></label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 items-start">
          <div>
            <label className="block text-sm font-medium invisible">Class</label>
            <div className="mt-2">
              {mode === 'new' ? (
                <>
                  <input
                    placeholder="e.g. Class 1"
                    value={name}
                    onChange={(e) => { setName(e.target.value); if (classErrors.name) setClassErrors(prev => { const c = { ...prev }; delete c.name; return c; }); }}
                    className={`w-full max-w-md h-10 px-3 border rounded ${classErrors.name ? 'border-red-500' : ''}`}
                  />
                  <div className="h-4 text-xs mt-1">{classErrors.name ? <span className="text-red-600">{classErrors.name}</span> : <span className="text-transparent">placeholder</span>}</div>
                </>
              ) : (
                <>
                  <select value={name} onChange={(e) => setName(e.target.value)} className="w-full max-w-md h-10 px-3 border rounded">
                  <option value="">Select existing class</option>
                  {existingClassNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <div className="h-4 text-xs mt-1">{/* reserved space to keep layout stable */}<span className="text-transparent">placeholder</span></div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Section Input */}
        <div>
          <label className="block text-sm font-medium">Section</label>
          <div className="mt-2">
            <input
              placeholder="e.g. A, B, C"
              value={section}
              onChange={(e) => { setSection(e.target.value); if (classErrors.section) setClassErrors(prev => { const c = { ...prev }; delete c.section; return c; }); }}
              className={`w-full max-w-md h-10 px-3 border rounded ${classErrors.section ? 'border-red-500' : ''}`}
            />
            <div className="h-4 text-xs mt-1">{classErrors.section ? <span className="text-red-600">{classErrors.section}</span> : <span className="text-transparent">placeholder</span>}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Assign Subject & Teacher</h3>
            {(loadingTeachers || loadingSubjects) && (
              <div className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-primary-600" />
                <span className="text-xs text-gray-500">Loading data...</span>
              </div>
            )}
          </div>
          <div className="flex justify-end mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={async (e: any) => { e.preventDefault(); if (!assignDataLoaded) await loadAssignData(); addAssignment(); }}
              disabled={loadingTeachers || loadingSubjects}
            >
              Assign Subject & Teacher
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {assignments.map((a, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="relative col-span-4">
                  <select className={`w-full h-9 px-3 border rounded text-sm ${assignmentErrors[idx]?.subject ? 'border-red-500' : ''}`} value={a.subject_id || ''} onChange={(e) => setAssignmentField(idx, 'subject_id', e.target.value)} disabled={loadingSubjects}>
                    {loadingSubjects ? (
                      <option value="">Loading subjects...</option>
                    ) : (
                      <>
                        <option value="">Select subject</option>
                        {subjects.map((s: any) => <option key={s.id || s._id} value={s.id || s._id}>{s.subject_name || s.name || s.subject_code || s.id}</option>)}
                      </>
                    )}
                  </select>
                  {/* absolute error overlay to avoid layout shift */}
                  {assignmentErrors[idx]?.subject && (
                    <div className="pointer-events-none absolute right-8 top-1 bg-white px-1 z-10 text-xs text-red-600">{assignmentErrors[idx].subject}</div>
                  )}
                </div>
                <div className="relative col-span-4">
                  <select className={`w-full h-9 px-3 border rounded text-sm ${assignmentErrors[idx]?.teacher ? 'border-red-500' : ''}`} value={a.teacher_id || ''} onChange={(e) => setAssignmentField(idx, 'teacher_id', e.target.value)} disabled={loadingTeachers || loadingSubjects}>
                    {loadingTeachers || loadingSubjects ? (
                      <option value="">Loading teachers...</option>
                    ) : (
                      <option value="">Select teacher</option>
                    )}
                  {(() => {
                    if (loadingTeachers) return null;

                    const subjectId = a.subject_id ? String(a.subject_id) : '';

                    // Helper to extract subject id strings from various teacher shapes
                    const extractSubjectIds = (t: any) => {
                      const arr = t.subjects || t.subject_ids || t.subject_list || [];
                      if (!Array.isArray(arr)) return [];
                      return arr.map((it: any) => {
                        if (!it && it !== 0) return '';
                        if (typeof it === 'string' || typeof it === 'number') return String(it);
                        return String(it.id || it._id || it.subject_id || '');
                      }).filter(Boolean);
                    };

                    // Filter by eligible teachers for subject (if subjectId provided)
                    let list = teachers || [];
                    if (subjectId) {
                      const eligible = list.filter((t: any) => {
                        const ids = extractSubjectIds(t);
                        return ids.includes(subjectId);
                      });
                      if (eligible.length > 0) list = eligible;
                    }

                    // Helper to pick display name from teacher object (robust)
                    const getDisplayName = (t: any) => {
                      return (t.name || t.fullName || t.full_name || t.teacher_name || t.first_name || t.firstName || t.displayName || t.id || t._id || '').toString().trim();
                    };

                    const validTeachers = list.filter((t: any) => {
                      const display = getDisplayName(t);
                      return !!display;
                    });

                    logger.debug('CLASSES', `Assignment ${idx}: ${validTeachers.length} valid teachers from ${list.length}`);

                    if (validTeachers.length === 0) return <option value="" disabled>No teachers available</option>;

                    return validTeachers.map((t: any) => (
                      <option key={t.id || t._id || getDisplayName(t)} value={t.id || t._id || getDisplayName(t)}>
                        {getDisplayName(t)}
                      </option>
                    ));
                  })()}
                  </select>
                  {assignmentErrors[idx]?.teacher && (
                    <div className="pointer-events-none absolute right-8 top-1 bg-white px-1 z-10 text-xs text-red-600">{assignmentErrors[idx].teacher}</div>
                  )}
                </div>
                <div className="col-span-2 flex justify-end pr-2">
                  <Button variant="danger" size="sm" className="px-2 py-1 text-sm" onClick={(e: any) => { e.preventDefault(); removeAssignment(idx); }}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={saving} onClick={() => { /* assignment validation runs in handle() */ }}>{saving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>) : (cls ? 'Save' : 'Create')}</Button>
        </div>
      </form>
    </Modal>
  );
};

// simple client-side validation helper
function normalizeInput(s?: string) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isNonEmptyString(s?: string) { return !!s && String(s).trim().length > 0; }

// keep helpers here

export default AddClassModal;