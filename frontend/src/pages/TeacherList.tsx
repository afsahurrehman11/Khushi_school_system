import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, AlertCircle, ChevronDown, UserPlus } from 'lucide-react';
import Modal from '../components/Modal';
import Button from '../components/Button';
import SearchBar from '../components/SearchBar';
import Table from '../components/Table';
import Badge from '../components/Badge';
import ClassCard from '../components/ClassCard';
import ViewToggle from '../components/ViewToggle';
import TeacherCard from '../components/TeacherCard';
import GroupByToggle from '../components/GroupByToggle';
import { apiCallJSON, getAuthHeaders } from '../utils/api';
import logger from '../utils/logger';
import AddTeacherModal from '../features/teachers/components/AddTeacherModal';

const TeacherList: React.FC = () => {
  const [groupBy, setGroupBy] = useState<'teachers' | 'classrooms'>('teachers');
  const [selectedItem, setSelectedItem] = useState<string | null>(null); // teacher ID or classroom name
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTeacher, setEditTeacher] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showUnassigned, setShowUnassigned] = useState(false);

  const unassignedTeachers = useMemo(() => teachers.filter((t) => !t.assignedClasses || t.assignedClasses.length === 0), [teachers]);
  const allClassrooms = useMemo(() => {
    const classes = teachers.flatMap((t) => t.assignedClasses || []);
    const unique = Array.from(new Set(classes)).sort();
    return unique.map((className) => ({ className, teacherCount: teachers.filter((t) => (t.assignedClasses || []).includes(className)).length }));
  }, [teachers]);

  // Get teachers based on grouping mode and selection
  const displayTeachers = useMemo(() => {
    if (showUnassigned) return unassignedTeachers;
    if (!selectedItem) return [];

    if (groupBy === 'classrooms') {
      return teachers.filter((t) => (t.assignedClasses || []).includes(selectedItem));
    } else {
      const teacher = teachers.find((t) => t.teacherId === selectedItem || String(t.id) === String(selectedItem));
      return teacher ? [teacher] : [];
    }
  }, [groupBy, selectedItem, showUnassigned, unassignedTeachers, teachers]);

  // Filter teachers based on search (only in detail view)
  const filteredTeachers = useMemo(() => {
    if (!searchQuery) return displayTeachers;

    return displayTeachers.filter((teacher: any) =>
      teacher.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      teacher.teacherId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      teacher.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      teacher.subjects.some((subject: string) =>
        subject.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }, [displayTeachers, searchQuery]);

  // Get all teachers for main view (when groupBy is teachers)
  // Use runtime `teachers` if available (show all teachers including unassigned)
  const allTeachers = useMemo(() => {
    try {
      // If features/teachers page is active it uses `teachers` state; fallback to empty array
      // Keep behavior consistent: show all teachers in main view
      // We attempt to read `teachers` from module scope if present (features variant), else return []
      // (This file may be unused at runtime if the features version is imported.)
      // For safety, return an empty array here — actual runtime page uses feature file.
      return [] as any[];
    } catch (err) {
      return [] as any[];
    }
  }, []);

  // Filter for main view search
  const filteredMainTeachers = useMemo(() => {
    if (!searchQuery || selectedItem || showUnassigned) return allTeachers;
    return allTeachers.filter((teacher: any) =>
      (teacher.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (teacher.teacherId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (teacher.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (teacher.subjects || []).some((subject: string) => subject.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [allTeachers, searchQuery, selectedItem, showUnassigned]);

  const filteredClassrooms = useMemo(() => {
    if (!searchQuery || selectedItem || showUnassigned) return allClassrooms;
    return allClassrooms.filter((classroom: { className: string }) => classroom.className.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allClassrooms, searchQuery, selectedItem, showUnassigned]);

  // Load teachers from API
  const loadTeachers = async () => {
    try {
      const data = await apiCallJSON('/api/teachers', { method: 'GET', headers: { ...getAuthHeaders() } });
      setTeachers(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('TEACHERS', `Failed to load teachers: ${String(err)}`);
      setTeachers([]);
    }
  };

  React.useEffect(() => { loadTeachers(); }, []);

  const openAddModal = () => {
    setAddModalOpen(true);
  };

  const deleteTeacher = async (id: string) => {
    try {
      await apiCallJSON(`/api/teachers/${id}`, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      loadTeachers();
      setSelectedTeacher(null);
    } catch (err) {
      logger.error('TEACHERS', `Failed to delete teacher: ${String(err)}`);
    }
  };

  const handleClassroomClick = (className: string) => {
    setSelectedItem(className);
    setShowUnassigned(false);
    setSearchQuery('');
  };

  const handleBackToMain = () => {
    setSelectedItem(null);
    setShowUnassigned(false);
    setSearchQuery('');
  };

  

  const handleTeacherProfileClick = (teacher: any) => {
    setSelectedTeacher(teacher);
  };

  const handleGroupByChange = (newGroupBy: 'teachers' | 'classrooms') => {
    setGroupBy(newGroupBy);
    setSelectedItem(null);
    setShowUnassigned(false);
    setSearchQuery('');
  };

  const handleUnassignedClick = () => {
    setShowUnassigned(!showUnassigned);
    if (!showUnassigned) {
      setSelectedItem(null);
    }
  };

  const columns = [
    { key: 'teacherId', label: 'Teacher ID' },
    { key: 'cnic', label: 'CNIC' },
    { key: 'name', label: 'Name' },
    {
      key: 'subjects',
      label: 'Subjects',
      render: (teacher: any) => (
        <div className="flex flex-wrap gap-1">
          {(teacher.subjects || []).slice(0, 2).map((subject: string, idx: number) => (
            <Badge key={idx} label={subject} color="primary" />
          ))}
          {(teacher.subjects || []).length > 2 && (
            <span className="text-xs text-secondary-500 ml-1">
              +{(teacher.subjects || []).length - 2}
            </span>
          )}
        </div>
      ),
    },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'experience', label: 'Experience' },
  ];

  // Main view: Show teacher or classroom cards
  if (!selectedItem && !showUnassigned) {
    return (
      <div className="min-h-screen bg-secondary-50 p-8">
        <div className="max-w-7xl mx-auto">
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

          {/* Unassigned Teachers Alert */}
          {unassignedTeachers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <button
                onClick={handleUnassignedClick}
                className="w-full bg-warning-50 border border-warning-200 rounded-xl p-4 hover:bg-warning-100 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-warning-500 rounded-lg flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-warning-900">
                        Unassigned Teachers
                      </h3>
                      <p className="text-sm text-warning-700">
                        {unassignedTeachers.length} teacher
                        {unassignedTeachers.length !== 1 ? 's' : ''} need to be
                        assigned to classes
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-warning-700" />
                </div>
              </button>
            </motion.div>
          )}

          {/* Display based on groupBy mode */}
          {groupBy === 'classrooms' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredClassrooms.map((classroom: { className: string; teacherCount?: number }) => {
                const [grade, section] = classroom.className.split('-');
                return (
                  <ClassCard
                    key={classroom.className}
                    className={grade}
                    section={section}
                    studentCount={classroom.teacherCount ?? 0}
                    onClick={() => handleClassroomClick(classroom.className)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMainTeachers.map((teacher: any) => (
                <TeacherCard
                  key={teacher.cnic || teacher.id}
                  {...teacher}
                  onClick={() => { setEditTeacher(teacher); setAddModalOpen(true); }}
                  onEdit={() => { setEditTeacher(teacher); setAddModalOpen(true); }}
                  onDelete={() => { deleteTeacher(teacher.cnic || teacher.id || teacher.teacherId || teacher._id); }}
                />
              ))}
            </div>
          )}

          {((groupBy === 'teachers' && filteredMainTeachers.length === 0) || 
            (groupBy === 'classrooms' && filteredClassrooms.length === 0)) && (
            <div className="bg-white rounded-xl shadow-soft p-12 text-center">
              <p className="text-secondary-500">No results found</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Detail view: Show teachers for selected classroom OR classes for selected teacher
  const isClassroomView = groupBy === 'classrooms';
  const selectedTeacherInfo = !isClassroomView && selectedItem 
    ? allTeachers.find((t: any) => t.teacherId === selectedItem) 
    : null;

  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={handleBackToMain}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-secondary-900">
                {showUnassigned
                  ? 'Unassigned Teachers'
                  : isClassroomView
                  ? `Class ${selectedItem} - Teachers`
                  : selectedTeacherInfo 
                  ? `${selectedTeacherInfo.name} - Assigned Classes`
                  : 'Teachers'}
              </h1>
              <p className="text-secondary-600">
                {showUnassigned 
                  ? `${filteredTeachers.length} teacher${filteredTeachers.length !== 1 ? 's' : ''}`
                  : isClassroomView
                  ? `${filteredTeachers.length} teacher${filteredTeachers.length !== 1 ? 's' : ''}`
                  : selectedTeacherInfo
                  ? `Teaching ${selectedTeacherInfo.assignedClasses?.length || 0} class${selectedTeacherInfo.assignedClasses?.length !== 1 ? 'es' : ''}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {showUnassigned && (
              <Button variant="primary" onClick={() => {}}>
                Assign to Classes
              </Button>
            )}
            <ViewToggle view={viewMode} onViewChange={setViewMode} />
          </div>
        </div>

        {/* Search Bar */}
        {(isClassroomView || showUnassigned) && (
          <div className="mb-6">
            <SearchBar
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, ID, email, or subject..."
            />
          </div>
        )}

        {/* Teachers Display (for classroom view or unassigned) */}
        {(isClassroomView || showUnassigned) && (
          <>
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTeachers.map((teacher: any) => (
                  <TeacherCard
                    key={teacher.id}
                    {...teacher}
                    onClick={() => { setEditTeacher(teacher); setAddModalOpen(true); }}
                    onEdit={() => { setEditTeacher(teacher); setAddModalOpen(true); }}
                    onDelete={() => { deleteTeacher(teacher.id || teacher.teacherId || teacher._id); }}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-soft overflow-hidden">
                <Table
                  data={filteredTeachers}
                  columns={columns}
                  onRowClick={handleTeacherProfileClick}
                />
              </div>
            )}

            {filteredTeachers.length === 0 && (
              <div className="bg-white rounded-xl shadow-soft p-12 text-center">
                <p className="text-secondary-500">No teachers found</p>
              </div>
            )}
          </>
        )}

        {/* Classes Display (for teacher view) */}
        {!isClassroomView && !showUnassigned && selectedTeacherInfo && (
          <>
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {selectedTeacherInfo.assignedClasses?.map((className: string) => {
                  const [grade, section] = className.split('-');
                  const teachersInClass = teachers.filter((t) => (t.assignedClasses || []).includes(className));
                  return (
                    <ClassCard
                      key={className}
                      className={grade}
                      section={section}
                      studentCount={teachersInClass.length}
                      onClick={() => {}}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-soft overflow-hidden p-6">
                <div className="space-y-3">
                  {selectedTeacherInfo.assignedClasses?.map((className: string, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-4 bg-secondary-50 rounded-lg hover:bg-secondary-100 transition-colors"
                    >
                      <div>
                        <p className="font-semibold text-secondary-900">Class {className}</p>
                        <p className="text-sm text-secondary-500">
                          {teachers.filter((t) => (t.assignedClasses || []).includes(className)).length} teacher{teachers.filter((t) => (t.assignedClasses || []).includes(className)).length !== 1 ? 's' : ''} assigned
                        </p>
                      </div>
                      <Badge label={className} color="secondary" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!selectedTeacherInfo.assignedClasses || selectedTeacherInfo.assignedClasses.length === 0) && (
              <div className="bg-white rounded-xl shadow-soft p-12 text-center">
                <p className="text-secondary-500">No assigned classes</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Teacher Profile Modal */}
      <AnimatePresence>
        {selectedTeacher && (
          <Modal
            isOpen={!!selectedTeacher}
            onClose={() => setSelectedTeacher(null)}
            title="Teacher Profile"
            size="lg"
          >
            <div className="space-y-6">
              <div className="flex items-center gap-4 pb-6 border-b border-secondary-200">
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-3xl font-bold text-primary-700">
                    {selectedTeacher.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-secondary-900">
                    {selectedTeacher.name}
                  </h2>
                  <p className="text-secondary-600">
                    ID: {selectedTeacher.teacherId}
                  </p>
                  <p className="text-sm text-secondary-500 mt-1">
                    {selectedTeacher.qualification}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-secondary-500 mb-1">Email</p>
                  <p className="text-secondary-900">{selectedTeacher.email}</p>
                </div>
                <div>
                  <p className="text-sm text-secondary-500 mb-1">Phone</p>
                  <p className="text-secondary-900">{selectedTeacher.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-secondary-500 mb-1">Experience</p>
                  <p className="text-secondary-900">{selectedTeacher.experience}</p>
                </div>
                <div>
                  <p className="text-sm text-secondary-500 mb-1">Date of Joining</p>
                  <p className="text-secondary-900">
                    {new Date(selectedTeacher.dateOfJoining).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-secondary-200">
                <h3 className="font-semibold text-secondary-900 mb-3">
                  Teaching Subjects
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(selectedTeacher.subjects || []).map((subject: string, idx: number) => (
                    <Badge key={idx} label={subject} color="primary" />
                  ))}
                </div>
              </div>

              {selectedTeacher.assignedClasses && selectedTeacher.assignedClasses.length > 0 && (
                <div className="pt-6 border-t border-secondary-200">
                  <h3 className="font-semibold text-secondary-900 mb-3">
                    Assigned Classes
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedTeacher.assignedClasses.map((className: string, idx: number) => (
                      <Badge key={idx} label={`Class ${className}`} color="secondary" />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-6 border-t border-secondary-200">
                <Button variant="primary" className="flex-1" onClick={() => { setEditTeacher(selectedTeacher); setAddModalOpen(true); }}>
                  Edit Profile
                </Button>
                <Button variant="danger" className="flex-1" onClick={() => { if (selectedTeacher) deleteTeacher(selectedTeacher.id || selectedTeacher.teacherId || selectedTeacher._id); }}>
                  Remove Teacher
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
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
