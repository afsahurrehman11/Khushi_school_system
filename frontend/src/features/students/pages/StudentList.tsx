import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, AlertCircle, ChevronDown, UserPlus, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchBar from '../../../components/SearchBar';
import Table from '../../../components/Table';
import Badge from '../../../components/Badge';
import ClassCard from '../../../components/ClassCard';
import ViewToggle from '../../../components/ViewToggle';
import StudentCard from '../../../components/StudentCard';
import AddStudentModal from '../components/AddStudentModal';
import { apiCallJSON, getAuthHeaders } from '../../../utils/api';
import { Student } from '../studentsData';

const StudentList: React.FC = () => {
  const navigate = useNavigate();
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showUnassigned, setShowUnassigned] = useState(false);

  // Modal states
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);

  // Runtime student data
  const [students, setStudents] = useState<Student[]>([]);

  // selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<any>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkClass, setBulkClass] = useState('');

  const loadStudents = async () => {
    try {
      const data = await apiCallJSON('/api/students');
      const mapped = (data || []).map((s: any) => ({
        id: Number(s.id || s.student_id || s.studentId || 0),
        name: s.full_name || s.name || '',
        rollNo: String(s.roll_number || s.roll || ''),
        class: s.class_id || s.class || null,
        assignedClasses: s.subjects || s.assigned_subjects || [],
        email: s.contact_info?.email || s.email || '',
        phone: s.contact_info?.phone || s.phone || '',
        dateOfBirth: s.date_of_birth || s.dateOfBirth || '',
        address: s.guardian_info?.address || s.address || '',
        guardianName: s.guardian_info?.father_name || s.guardian_info?.mother_name || s.guardian_name || '',
        guardianPhone: s.guardian_info?.guardian_contact || s.guardian_info?.guardian_phone || s.guardian_contact || '',
        parentCnic: s.guardian_info?.parent_cnic || s.parent_cnic || '',
      }));
      setStudents(mapped);
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => { loadStudents(); }, []);

  const allClasses = useMemo(() => {
    const classes = students.map((st) => st.class).filter((c): c is string => !!c);
    return Array.from(new Set(classes)).sort();
  }, [students]);

  const unassignedStudents = useMemo(() => students.filter((s) => !s.class), [students]);

  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    return students.filter((s) => s.class === selectedClass);
  }, [selectedClass, students]);

  const filteredStudents = useMemo(() => {
    const list = showUnassigned ? unassignedStudents : classStudents;
    if (!searchQuery) return list;
    return list.filter((student: Student) =>
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.rollNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [classStudents, unassignedStudents, searchQuery, showUnassigned]);

  const classStats = useMemo(() => {
    return allClasses.map((className: string) => {
      const studentsInClass = students.filter((s) => s.class === className);
      const [grade, section] = className.split('-');
      return {
        className: grade,
        section,
        fullName: className,
        studentCount: studentsInClass.length,
      };
    });
  }, [allClasses, students]);

  const handleClassClick = (className: string) => {
    setSelectedClass(className);
    setShowUnassigned(false);
    setSearchQuery('');
  };

  const handleBackToClasses = () => {
    setSelectedClass(null);
    setShowUnassigned(false);
    setSearchQuery('');
  };

  const handleUnassignedClick = () => {
    setShowUnassigned(!showUnassigned);
    if (!showUnassigned) setSelectedClass(null);
  };

  const handleStudentClick = (student: Student) => setSelectedStudent(student);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const deleteStudent = async (id: any) => {
    try {
      await apiCallJSON(`/api/students/${String(id)}`, { method: 'DELETE', headers: getAuthHeaders() });
      setStudents((prev) => prev.filter((s) => s.id !== id));
      if (selectedStudent?.id === id) setSelectedStudent(null);
    } catch (err) {
      // ignore
    }
  };

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => apiCallJSON(`/api/students/${String(id)}`, { method: 'DELETE', headers: getAuthHeaders() })));
      setStudents((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      clearSelection();
    } catch (err) {
      // ignore
    }
  };

  const assignSelectedToClass = async (classId: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => apiCallJSON(`/api/students/${String(id)}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: classId }),
      })));
      // Update local state
      setStudents((prev) => prev.map((s) => (selectedIds.has(s.id) ? { ...s, class: classId } : s)));
      clearSelection();
      setBulkAssignOpen(false);
    } catch (err) {
      // ignore
    }
  };

  const columns = [
    { key: 'rollNo', label: 'Roll No' },
    { key: 'name', label: 'Name' },
    { key: 'parentCnic', label: 'Parent CNIC' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    {
      key: 'assignedClasses',
      label: 'Subjects',
      render: (student: Student) => (
        <div className="flex flex-wrap gap-1">
          {student.assignedClasses.slice(0, 2).map((subject: string, idx: number) => (
            <Badge key={idx} label={subject} color="primary" />
          ))}
          {student.assignedClasses.length > 2 && (
            <span className="text-xs text-secondary-500 ml-1">+{student.assignedClasses.length - 2}</span>
          )}
        </div>
      ),
    },
  ];

  // Main view
  const gridContainer = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };

  const gridItem = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.36 } },
  };

  // Main view
  if (!selectedClass && !showUnassigned) {
    return (
      <div className="min-h-screen bg-secondary-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-secondary-900 mb-2">Student Management</h1>
              <p className="text-secondary-600">Select a class to view and manage students</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => navigate('/students/import-export')}>
                <Upload className="w-4 h-4 mr-1" />Import / Export
              </Button>
              <Button variant="primary" onClick={() => setAddStudentOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />Add Student
              </Button>
            </div>
          </div>

          {unassignedStudents.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <button onClick={handleUnassignedClick} className="w-full bg-warning-50 border border-warning-200 rounded-xl p-4 hover:bg-warning-100 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-warning-500 rounded-lg flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-warning-900">Unassigned Students</h3>
                      <p className="text-sm text-warning-700">{unassignedStudents.length} student{unassignedStudents.length !== 1 ? 's' : ''} need to be assigned to a class</p>
                    </div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-warning-700" />
                </div>
              </button>
            </motion.div>
          )}

          <motion.div variants={gridContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {classStats.map((classInfo) => (
              <motion.div key={classInfo.fullName} variants={gridItem} whileHover={{ zIndex: 1 }}>
                <ClassCard className={classInfo.className} section={classInfo.section} studentCount={classInfo.studentCount} onClick={() => handleClassClick(classInfo.fullName)} />
              </motion.div>
            ))}
          </motion.div>
        </div>

        <AddStudentModal isOpen={addStudentOpen} onClose={() => setAddStudentOpen(false)} />
      </div>
    );
  }

  // Detail view
  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={handleBackToClasses}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
            <div>
              <h1 className="text-3xl font-bold text-secondary-900">{showUnassigned ? 'Unassigned Students' : `Class ${selectedClass}`}</h1>
              <p className="text-secondary-600">{filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {showUnassigned && <Button variant="primary">Assign to Class</Button>}
            <ViewToggle view={viewMode} onViewChange={setViewMode} />
          </div>
        </div>

        <div className="mb-6">
          <SearchBar value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, roll number, or email..." />
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStudents.map((student: Student) => (
              <StudentCard
                key={student.id}
                {...student}
                class={student.class || 'Unassigned'}
                onClick={() => handleStudentClick(student)}
                selectable={true}
                checked={selectedIds.has(String(student.id))}
                onToggleSelect={() => toggleSelect(String(student.id))}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-soft overflow-hidden">
            <Table data={filteredStudents} columns={columns} onRowClick={handleStudentClick} selectable selectedIds={selectedIds} onToggleSelect={(id) => toggleSelect(String(id))} />
          </div>
        )}

        {filteredStudents.length === 0 && (
          <div className="bg-white rounded-xl shadow-soft p-12 text-center"><p className="text-secondary-500">No students found</p></div>
        )}
      </div>

      <AnimatePresence>
        {selectedStudent && (
          <Modal isOpen={!!selectedStudent} onClose={() => setSelectedStudent(null)} title="Student Profile" size="lg">
            <div className="space-y-6">
              <div className="flex items-center gap-4 pb-6 border-b border-secondary-200">
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center"><span className="text-3xl font-bold text-primary-700">{selectedStudent.name.charAt(0)}</span></div>
                <div>
                  <h2 className="text-2xl font-bold text-secondary-900">{selectedStudent.name}</h2>
                  <p className="text-secondary-600">Roll No: {selectedStudent.rollNo}</p>
                  <Badge label={selectedStudent.class || 'Unassigned'} color="primary" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-secondary-500 mb-1">Email</p>
                  <p className="text-secondary-900">{selectedStudent.email}</p>
                </div>
                <div>
                  <p className="text-sm text-secondary-500 mb-1">Phone</p>
                  <p className="text-secondary-900">{selectedStudent.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-secondary-500 mb-1">Date of Birth</p>
                  <p className="text-secondary-900">{selectedStudent.dateOfBirth ? new Date(selectedStudent.dateOfBirth).toLocaleDateString() : ''}</p>
                </div>
                <div>
                  <p className="text-sm text-secondary-500 mb-1">Address</p>
                  <p className="text-secondary-900">{selectedStudent.address}</p>
                </div>
              </div>

              <div className="pt-6 border-t border-secondary-200">
                <h3 className="font-semibold text-secondary-900 mb-3">Guardian Information</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-secondary-500 mb-1">Parent CNIC</p>
                    <p className="text-secondary-900">{selectedStudent.parentCnic || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500 mb-1">Guardian Name</p>
                    <p className="text-secondary-900">{selectedStudent.guardianName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500 mb-1">Guardian Phone</p>
                    <p className="text-secondary-900">{selectedStudent.guardianPhone}</p>
                  </div>
                </div>
              </div>

              {selectedStudent.assignedClasses.length > 0 && (
                <div className="pt-6 border-t border-secondary-200">
                  <h3 className="font-semibold text-secondary-900 mb-3">Enrolled Subjects</h3>
                  <div className="flex flex-wrap gap-2">{selectedStudent.assignedClasses.map((subject: string, idx: number) => <Badge key={idx} label={subject} color="primary" />)}</div>
                </div>
              )}

              <div className="flex gap-3 pt-6 border-t border-secondary-200">
                <Button variant="primary" className="flex-1" onClick={() => { setEditStudent(selectedStudent); setEditOpen(true); }}>
                  Edit Profile
                </Button>
                <Button variant="danger" className="flex-1" onClick={async () => { await deleteStudent(String(selectedStudent.id)); }}>
                  Remove Student
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AddStudentModal isOpen={addStudentOpen} onClose={() => setAddStudentOpen(false)} onStudentAdded={() => loadStudents()} />

      {/* Edit student modal */}
      <AddStudentModal isOpen={editOpen} onClose={() => { setEditOpen(false); setEditStudent(null); }} student={editStudent} onStudentUpdated={() => { loadStudents(); setEditOpen(false); setEditStudent(null); }} />
      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed left-1/2 transform -translate-x-1/2 bottom-6 bg-white border border-secondary-200 rounded-lg shadow-lg px-4 py-3 flex items-center gap-4">
          <div className="font-medium">{selectedIds.size} selected</div>
          <Button variant="danger" size="sm" onClick={deleteSelected}>Delete Selected</Button>
          <Button variant="secondary" size="sm" onClick={() => setBulkAssignOpen(true)}>Assign to Class</Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
        </div>
      )}

      {/* Bulk assign modal */}
      <Modal isOpen={bulkAssignOpen} onClose={() => setBulkAssignOpen(false)} title="Assign Selected Students to Class">
        <div className="space-y-4">
          <input type="text" value={bulkClass} onChange={(e) => setBulkClass(e.target.value)} placeholder="Enter class id" className="w-full px-3 py-2 border rounded" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBulkAssignOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => assignSelectedToClass(bulkClass)}>Assign</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
 
export default StudentList;
 
