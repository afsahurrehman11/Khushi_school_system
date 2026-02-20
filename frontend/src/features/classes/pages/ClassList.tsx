import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import Button from '../../../components/Button';
import ClassCard from '../components/ClassCard';
import AddClassModal from '../components/AddClassModal';
import { getClasses, deleteClass } from '../services/classesApi';

const ClassList: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editClass, setEditClass] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const load = async () => {
    setLoading(true);
    try {
      // Fetch classes directly from backend and render one card per DB record (class_name + section)
      const data = await getClasses();
      const classesFromDb = Array.isArray(data) ? data : [];

        const built = classesFromDb.map((cl:any) => {
        const className = (cl.class_name || cl.name || '').trim();
        const section = (cl.section || '').trim();
        const displayName = section ? `${className} — ${section}` : className;
        const assignments = Array.isArray(cl.assigned_subjects) ? cl.assigned_subjects.map((a:any) => ({ subject: a.subject_name || a.subject || a.subject_id || '', teacher: a.teacher_name || a.teacher_id || '' , time: a.time || '' })) : [];
        return {
          id: cl.id || cl._id,
          name: displayName,
          class_name: className,
          section: section,
            // capacity removed
          assignments,
          _db: cl,
        };
      });

      setClasses(built);
    } catch (err) {
      setClasses([]);
    } finally {
      setLoading(false);
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

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-secondary-600">Loading classes...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {classes.length === 0 ? (
              <div className="col-span-1 md:col-span-3 bg-white rounded-xl shadow-soft p-8 text-center">
                <p className="text-secondary-600">No classes found. Add a class to get started.</p>
              </div>
            ) : (
              classes.map((c) => (
                <ClassCard
                  key={c.id || c._id || `${c.class_name || ''}::${c.section || ''}`}
                  {...c}
                  onEdit={() => { setEditClass(c); setAddOpen(true); }}
                  onDelete={c.id ? async () => { await deleteClass(c.id); load(); } : undefined}
                />
              ))
            )}
          </div>
        )}
      </div>

      <AddClassModal isOpen={addOpen} onClose={() => setAddOpen(false)} cls={editClass} onSaved={() => load()} />
    </div>
  );
};

export default ClassList;
