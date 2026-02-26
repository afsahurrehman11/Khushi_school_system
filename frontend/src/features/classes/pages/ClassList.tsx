import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import Button from '../../../components/Button';
import ClassCard from '../components/ClassCard';
import AddClassModal from '../components/AddClassModal';
import { getClasses, deleteClass } from '../services/classesApi';
import { entitySync, useEntitySync } from '../../../utils/entitySync';

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

  // Entity synchronization
  useEntitySync('class', (event) => {
    if (event.type === 'created' || event.type === 'updated' || event.type === 'deleted') {
      load(); // Reload classes when classes change
    }
  });

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-blue-50 via-purple-50 to-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Classes</h1>
            <p className="text-sm text-gray-600 mt-1">Manage your school classes and sections</p>
          </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {classes.length === 0 ? (
              <div className="col-span-1 md:col-span-2 xl:col-span-3 bg-white rounded-xl shadow-soft p-8 text-center border border-blue-100">
                <p className="text-secondary-600">No classes found. Add a class to get started.</p>
              </div>
            ) : (
              classes.map((c) => (
                <ClassCard
                  key={c.id || c._id || `${c.class_name || ''}::${c.section || ''}`}
                  {...c}
                  onEdit={() => { setEditClass(c); setAddOpen(true); }}
                  onDelete={c.id ? async () => { await deleteClass(c.id); entitySync.emitClassDeleted(c.id); load(); } : undefined}
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
