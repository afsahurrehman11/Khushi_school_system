import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import Button from '../../../components/Button';
import SubjectCard from '../components/SubjectCard';
import AddSubjectModal from '../components/AddSubjectModal';
import { getSubjects, deleteSubject } from '../services/subjectsApi';
import { entitySync, useEntitySync } from '../../../utils/entitySync';
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

  // Entity synchronization
  useEntitySync('subject', (event) => {
    if (event.type === 'created' || event.type === 'updated' || event.type === 'deleted') {
      load(); // Reload subjects when subjects change
    }
  });

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-green-50 via-teal-50 to-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Subjects</h1>
            <p className="text-sm text-gray-600 mt-1">Manage your school subjects and assignments</p>
          </div>
          <Button variant="primary" onClick={() => { setEditSubject(null); setAddOpen(true); }}>
            <UserPlus className="w-4 h-4 mr-2" /> Add Subject
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
              onDelete={async () => { try { const id = s.id || s._id || s.subject_code || s.code; await deleteSubject(id); entitySync.emitSubjectDeleted(id); await load(); } catch (err:any) { logger.error('SUBJECTS', `Failed to delete subject: ${String(err)}`); alert('Delete failed: '+ (err?.message || err)); } }}
            />
          ))}
        </div>
      </div>

      <AddSubjectModal isOpen={addOpen} onClose={() => setAddOpen(false)} subject={editSubject} onSaved={() => load()} />
    </div>
  );
};

export default SubjectList;
