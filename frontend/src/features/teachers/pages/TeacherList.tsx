import React, { useState, useMemo } from 'react';
import { UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../components/Button';
import SearchBar from '../../../components/SearchBar';
import ClassCard from '../../../components/ClassCard';
import TeacherCard from '../../../components/TeacherCard';
import GroupByToggle from '../../../components/GroupByToggle';
import { apiCallJSON, getAuthHeaders } from '../../../utils/api';
import { entitySync, useEntitySync } from '../../../utils/entitySync';
import logger from '../../../utils/logger';
import AddTeacherModal from '../components/AddTeacherModal';

const TeacherList: React.FC = () => {
  const navigate = useNavigate();
  const [groupBy, setGroupBy] = useState<'teachers' | 'classrooms'>('teachers');
  const [selectedItem, setSelectedItem] = useState<string | null>(null); // teacher ID or classroom name
  const [teachers, setTeachers] = useState<any[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTeacher, setEditTeacher] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnassigned, setShowUnassigned] = useState(false);

  const unassignedTeachers = useMemo(() => uniqueTeachers.filter((t) => !t.assignedClasses || t.assignedClasses.length === 0), [uniqueTeachers]);
  const uniqueTeachers = useMemo(() => {
    const seen = new Set();
    return teachers.filter((t) => {
      const id = t.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [teachers]);
  const allClassrooms = useMemo(() => {
    const classes = uniqueTeachers.flatMap((t) => t.assignedClasses || []);
    const unique = Array.from(new Set(classes)).sort();
    return unique.map((className) => ({ className, teacherCount: uniqueTeachers.filter((t) => (t.assignedClasses || []).includes(className)).length }));
  }, [uniqueTeachers]);

  // Get teachers based on grouping mode and selection
  const displayTeachers = useMemo(() => {
    if (showUnassigned) return unassignedTeachers;
    if (!selectedItem) return [];

    if (groupBy === 'classrooms') {
      return uniqueTeachers.filter((t) => (t.assignedClasses || []).includes(selectedItem));
    } else {
      const teacher = uniqueTeachers.find((t) => t.teacherId === selectedItem || String(t.id) === String(selectedItem) || t.cnic === selectedItem);
      return teacher ? [teacher] : [];
    }
  }, [groupBy, selectedItem, showUnassigned, unassignedTeachers, uniqueTeachers]);

  // Filter teachers based on search (only in detail view)
  useMemo(() => {
    if (!searchQuery) return displayTeachers;

    return displayTeachers.filter(
      (teacher) =>
        teacher.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (teacher.teacherId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (teacher.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (teacher.subjects || []).some((subject: string) => subject.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [displayTeachers, searchQuery]);

  // Get all teachers for main view (when groupBy is teachers)
  // Show all teachers (including unassigned) in main view so list isn't empty
  useMemo(() => teachers, [teachers]);

  // Filter for main view search
  const filteredMainTeachers = useMemo(() => {
    if (!searchQuery || selectedItem || showUnassigned) return uniqueTeachers;
    return uniqueTeachers.filter((teacher: any) =>
      (teacher.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (teacher.teacherId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (teacher.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (teacher.subjects || []).some((subject: string) => subject.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [uniqueTeachers, searchQuery, selectedItem, showUnassigned]);

  const filteredClassrooms = useMemo(() => {
    if (!searchQuery || selectedItem || showUnassigned) return allClassrooms;
    return allClassrooms.filter((classroom) => classroom.className.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allClassrooms, searchQuery, selectedItem, showUnassigned]);

  // Load teachers from API
  const loadTeachers = async () => {
    try {
      const data = await apiCallJSON('/teachers', { method: 'GET', headers: { ...getAuthHeaders() } });
      setTeachers(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('TEACHERS', `Failed to load teachers: ${String(err)}`);
      setTeachers([]);
    }
  };

  React.useEffect(() => { loadTeachers(); }, []);

  // Entity synchronization
  useEntitySync('teacher', (event) => {
    if (event.type === 'created' || event.type === 'updated' || event.type === 'deleted') {
      loadTeachers(); // Reload teachers when teachers change
    }
  });

  useEntitySync('class', (event) => {
    if (event.type === 'created' || event.type === 'updated' || event.type === 'deleted') {
      loadTeachers(); // Reload teachers when classes change (assignments may be affected)
    }
  });

  const openAddModal = () => {
    setAddModalOpen(true);
  };

  const deleteTeacher = async (id: string) => {
    try {
      logger.info('[TEACHERSLIST]', `Deleting teacher ID: "${id}"`);
      await apiCallJSON(`/teachers/${id}`, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      logger.info('[TEACHERSLIST]', '✅ Teacher deleted successfully');
      entitySync.emitTeacherDeleted(id);
      loadTeachers();
    } catch (err) {
      logger.error('[TEACHERSLIST]', `❌ Failed to delete teacher: ${String(err)}`);
    }
  };

  const handleClassroomClick = (className: string) => {
    setSelectedItem(className);
    setShowUnassigned(false);
    setSearchQuery('');
  };

  const handleGroupByChange = (newGroupBy: 'teachers' | 'classrooms') => {
    setGroupBy(newGroupBy);
    setSelectedItem(null);
    setShowUnassigned(false);
    setSearchQuery('');
  };

  // Determine which view to show
  const showMainView = !selectedItem && !showUnassigned;

  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Main view: Show teacher or classroom cards */}
        {showMainView && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-secondary-900 mb-2">
                  Teacher Management
                </h1>
                <p className="text-secondary-600">
                  {groupBy === 'teachers' 
                    ? 'View teachers and their assigned classes'
                    : 'View classrooms and their assigned teachers'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <GroupByToggle groupBy={groupBy} onGroupByChange={handleGroupByChange} />
                  <Button type="button" variant="primary" onClick={openAddModal}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Teacher
                  </Button>

              </div>
            </div>

          {/* Search Bar */}
          <div className="mb-6">
            <SearchBar
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={groupBy === 'teachers' 
                ? "Search teachers by name, ID, email, or subject..." 
                : "Search classrooms..."}
            />
          </div>

          {/* Unassigned Teachers banner removed per request */}

          {/* Display based on groupBy mode */}
          {groupBy === 'classrooms' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredClassrooms.map((classroom) => {
                const [grade, section] = classroom.className.split('-');
                return (
                  <ClassCard
                    key={classroom.className}
                    className={grade}
                    section={section}
                    studentCount={classroom.teacherCount}
                    onClick={() => handleClassroomClick(classroom.className)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMainTeachers.map((teacher) => {
                const id = teacher.cnic || teacher.id || teacher.teacherId || teacher._id;
                return (
                  <TeacherCard
                    key={teacher.id}
                    {...teacher}
                    onClick={() => { 
                      logger.info('[TEACHERS]', `Navigating to teacher detail - ID: "${id}" (type: ${typeof id})`);
                      navigate(`/teachers/${id}`); 
                    }}
                    onDelete={() => { 
                      logger.info('[TEACHERS]', `Attempting delete - ID: "${id}" (type: ${typeof id})`);
                      deleteTeacher(id); 
                    }}
                  />
                );
              })}
            </div>
          )}

          {((groupBy === 'teachers' && filteredMainTeachers.length === 0) || 
            (groupBy === 'classrooms' && filteredClassrooms.length === 0)) && (
            <div className="bg-white rounded-xl shadow-soft p-12 text-center">
              <p className="text-secondary-500">No results found</p>
            </div>
          )}
          </>
        )}
      </div>

      {/* Add / Edit Teacher Modal */}
      <AddTeacherModal
        isOpen={addModalOpen}
        onClose={() => { setAddModalOpen(false); setEditTeacher(null); }}
        onTeacherAdded={() => loadTeachers()}
        teacher={editTeacher}
        onTeacherUpdated={() => { loadTeachers(); setEditTeacher(null); }}
      />
    </div>
  );
};

export default TeacherList;
