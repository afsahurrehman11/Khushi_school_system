import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import Button from '../../../components/Button';
import ClassCard from '../components/ClassCard';
import AddClassModal from '../components/AddClassModal';
import { getClasses, deleteClass } from '../services/classesApi';
import { getSubjects } from '../../subjects/services/subjectsApi';
import api from '../../../utils/api';

const ClassList: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editClass, setEditClass] = useState<any | null>(null);

  const load = async () => {
    try {
      // Fetch classes, subjects and teachers
      const [data, subs, teachers] = await Promise.all([getClasses().catch(() => []), getSubjects().catch(() => []), api.get('/api/teachers').catch(() => [])]);
      const classesFromDb = Array.isArray(data) ? data : [];
      const subjectList = Array.isArray(subs) ? subs : [];
      const teacherList = Array.isArray(teachers) ? teachers : [];

      const teacherMap: Record<string,string> = {};
      teacherList.forEach((t:any) => { const id = t.id || t._id || t.teacherId || t.cnic; teacherMap[id] = t.name || t.fullName || id; });

      // Build Grade 1..Grade 10 cards and aggregate assignments from subjects.assigned_classes
      const grades = Array.from({ length: 10 }, (_, i) => `Grade ${i+1}`);
      // map DB classes by name for linking
      const classByName: Record<string, any> = {};
      for (const cl of classesFromDb) {
        const nameKey = (cl.class_name || cl.name || '').trim();
        if (nameKey) classByName[nameKey] = cl;
      }

      const built: any[] = [];
      for (const g of grades) {
        // collect sections from DB and from subject assignments
        const sections = new Set<string>();
        for (const cl of classesFromDb) {
          const nameKey = (cl.class_name || cl.name || '').trim();
          if (nameKey === g) sections.add((cl.section || '').trim());
        }
        for (const s of subjectList) {
          const assigned = Array.isArray(s.assigned_classes) ? s.assigned_classes : [];
          for (const a of assigned) {
            const cn = (a?.class_name || a?.class || '').trim();
            if (cn === g) sections.add((a?.section || '').trim());
          }
        }
        if (sections.size === 0) sections.add('');

        for (const sec of sections) {
          const dbClass = classesFromDb.find((cl:any) => ((cl.class_name || cl.name || '').trim() === g) && ((cl.section || '').trim() === sec));
          const assignments: Array<{ subject:string; teacher:string; time:string }> = [];
          for (const s of subjectList) {
            const sName = s.subject_name || s.name || s.subject_code || (s.id || s._id) || '';
            const assigned = Array.isArray(s.assigned_classes) ? s.assigned_classes : [];
            for (const a of assigned) {
              const className = (a?.class_name || a?.class || '').trim();
              const section = (a?.section || '').trim();
              if (!className) continue;
              if (className === g && section === sec) {
                const tid = a.teacher_id || a.teacher || '';
                const teacherName = a.teacher_name || teacherMap[String(tid)] || String(tid) || 'Unknown';
                assignments.push({ subject: sName, teacher: teacherName, time: a.time || '' });
              }
            }
          }
          const displayName = sec ? `${g} — ${sec}` : g;
          built.push({ id: dbClass?.id || dbClass?._id, name: displayName, class_name: g, section: sec, capacity: dbClass?.capacity, assignments, _db: dbClass });
        }
      }

      setClasses(built);
    } catch (err) {
      setClasses([]);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen p-8 bg-secondary-50">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Classes</h1>
          <Button variant="primary" onClick={() => { setEditClass(null); setAddOpen(true); }}>
            <UserPlus className="w-4 h-4 mr-2" /> Add Class
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {classes.map((c) => (
            <ClassCard
              key={c.id || c._id || c.class_name + '::' + (c.section||'') || c.name}
              {...c}
              onEdit={() => { setEditClass(c); setAddOpen(true); }}
              onDelete={c.id ? async () => { await deleteClass(c.id); load(); } : undefined}
            />
          ))}
        </div>
      </div>

      <AddClassModal isOpen={addOpen} onClose={() => setAddOpen(false)} cls={editClass} onSaved={() => load()} />
    </div>
  );
};

export default ClassList;
