import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import Button from '../../../components/Button';
import SubjectCard from '../components/SubjectCard';
import AddSubjectModal from '../components/AddSubjectModal';
import { getSubjects, deleteSubject } from '../services/subjectsApi';
import api from '../../../utils/api';
import logger from '../../../utils/logger';

const SubjectList: React.FC = () => {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teacherMap, setTeacherMap] = useState<Record<string,string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [editSubject, setEditSubject] = useState<any | null>(null);

  const load = async () => {
    try {
      const data = await getSubjects();
      setSubjects(Array.isArray(data) ? data : []);
    } catch (err) {
      setSubjects([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const t = await api.get('/api/teachers');
        const map: Record<string,string> = {};
        if (Array.isArray(t)) {
          for (const te of t) {
            const id = te.id || te._id || te.teacherId || te.cnic;
            const name = te.name || te.fullName || te.teacherId || te.cnic || id;
            if (id) map[String(id)] = name;
          }
        }
        setTeacherMap(map);
      } catch (e) {
        setTeacherMap({});
      }
    })();
  }, []);

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen p-8 bg-secondary-50">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Subjects</h1>
          <Button variant="primary" onClick={() => { setEditSubject(null); setAddOpen(true); }}>
            <UserPlus className="w-4 h-4 mr-2" /> Add Subject
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {subjects.map((s) => (
            <SubjectCard
              key={s.id || s._id || s.subject_code || Math.random()}
              id={s.id || s._id}
              name={s.subject_name || s.name}
              code={s.subject_code || s.code}
              description={s.description || s.subject_description}
              assigned_classes={s.assigned_classes}
              teacherMap={teacherMap}
              onEdit={() => { setEditSubject(s); setAddOpen(true); }}
              onDelete={async () => { try { await deleteSubject(s.id || s._id || s.subject_code || s.code); await load(); } catch (err:any) { logger.error('SUBJECTS', `Failed to delete subject: ${String(err)}`); alert('Delete failed: '+ (err?.message || err)); } }}
            />
          ))}
        </div>
      </div>

      <AddSubjectModal isOpen={addOpen} onClose={() => setAddOpen(false)} subject={editSubject} onSaved={() => load()} />
    </div>
  );
};

export default SubjectList;
