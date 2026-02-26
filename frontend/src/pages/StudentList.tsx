import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, AlertCircle, ChevronDown, UserPlus, Download, Upload, FileSpreadsheet } from 'lucide-react';
import Modal from '../components/Modal';
import Button from '../components/Button';
import SearchBar from '../components/SearchBar';
import Table from '../components/Table';
import Badge from '../components/Badge';
import ClassCard from '../components/ClassCard';
import ViewToggle from '../components/ViewToggle';
import StudentCard from '../components/StudentCard';
import ImportModal from '../features/students/components/ImportModal';
import ExportModal from '../features/students/components/ExportModal';
import ImportHistoryModal from '../features/students/components/ImportHistoryModal';
import AddStudentModal from '../features/students/components/AddStudentModal';
import { downloadSampleTemplate } from '../features/students/services/importExportApi';
import { classesService } from '../services/classes';
import { Class } from '../types';
import { useEntitySync } from '../utils/entitySync';
import {
  Student,
  getAllClasses,
  getStudentsByClass,
  getUnassignedStudents,
} from '../features/students/studentsData';

const StudentList: React.FC = () => {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showUnassigned, setShowUnassigned] = useState(false);

  // Modal states
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // API-fetched classes
  const [apiClasses, setApiClasses] = useState<Class[]>([]);
  const [, setLoadingClasses] = useState(false);

  // Check if current user is Admin (import/export is Admin-only, NOT Root)
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const checkAdmin = () => {
      try {
        const userStr = localStorage.getItem('user');
        if (!userStr) { setIsAdmin(false); return; }
        const user = JSON.parse(userStr);
        const role = typeof user.role === 'string' ? user.role : user.role?.name || '';
        setIsAdmin(role?.toLowerCase() === 'admin');
      } catch {
        setIsAdmin(false);
      }
    };
    checkAdmin();
    // Re-check periodically in case login state changes
    const interval = setInterval(checkAdmin, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load classes from API
  useEffect(() => {
    const loadClasses = async () => {
      setLoadingClasses(true);
      try {
        const response = await classesService.getClasses();
        setApiClasses(response.items || []);
      } catch (error) {
        console.error('Error loading classes:', error);
      } finally {
        setLoadingClasses(false);
      }
    };
    loadClasses();
  }, []);

  // Listen for class changes to refresh the class list
  useEntitySync('class', (event) => {
    if (event.type === 'created' || event.type === 'updated' || event.type === 'deleted') {
      // Refresh classes when any class changes
      const loadClasses = async () => {
        try {
          const response = await classesService.getClasses();
          setApiClasses(response.items || []);
        } catch (error) {
          console.error('Error refreshing classes after sync:', error);
        }
      };
      loadClasses();
    }
  });

  const allClasses = useMemo(() => getAllClasses(), []);
  const unassignedStudents = useMemo(() => getUnassignedStudents(), []);

  // Get students for selected class
  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    return getStudentsByClass(selectedClass);
  }, [selectedClass]);

  // Filter students based on search
  const filteredStudents = useMemo(() => {
    const students = showUnassigned ? unassignedStudents : classStudents;
    if (!searchQuery) return students;

    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.rollNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [classStudents, unassignedStudents, searchQuery, showUnassigned]);

  // Calculate stats for each class
  const classStats = useMemo(() => {
    // Use API classes if available, otherwise fall back to local classes
    if (apiClasses.length > 0) {
      return apiClasses.map((cls) => {
        const className = cls.section ? `${cls.name}-${cls.section}` : cls.name;
        const students = getStudentsByClass(className);
        return {
          className: cls.name,
          section: cls.section || '',
          fullName: className,
          studentCount: students.length,
        };
      });
    }
    
    // Fallback to local data if API hasn't loaded yet
    return allClasses.map((className) => {
      const students = getStudentsByClass(className);
      const [grade, section] = className.split('-');
      return {
        className: grade,
        section,
        fullName: className,
        studentCount: students.length,
      };
    });
  }, [apiClasses, allClasses]);

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
    if (!showUnassigned) {
      setSelectedClass(null);
    }
  };

  const handleStudentClick = (student: Student) => {
    setSelectedStudent(student);
  };

  const columns = [
    { key: 'rollNo', label: 'Roll No' },
    { key: 'name', label: 'Name' },
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
            <span className="text-xs text-secondary-500 ml-1">
              +{student.assignedClasses.length - 2}
            </span>
          )}
        </div>
      ),
    },
  ];

  // Main view: Show class cards
  if (!selectedClass && !showUnassigned) {
    return (
      <div className="min-h-screen bg-secondary-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-secondary-900 mb-2">
                Student Management
              </h1>
              <p className="text-secondary-600">
                Select a class to view and manage students
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <Button variant="secondary" size="sm" onClick={async () => {
                    try { await downloadSampleTemplate(); } catch {}
                  }}>
                    <FileSpreadsheet className="w-4 h-4 mr-1" />
                    Sample Excel
                  </Button>
                  <Button variant="success" size="sm" onClick={() => setImportOpen(true)}>
                    <Upload className="w-4 h-4 mr-1" />
                    Import Students
                  </Button>
                  <Button variant="warning" size="sm" onClick={() => setExportOpen(true)}>
                    <Download className="w-4 h-4 mr-1" />
                    Export Students
                  </Button>
                </>
              )}
              <Button variant="primary" onClick={() => setAddStudentOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Student
              </Button>
            </div>
          </div>

          {/* Unassigned Students Alert */}
          {unassignedStudents.length > 0 && (
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
                        Unassigned Students
                      </h3>
                      <p className="text-sm text-warning-700">
                        {unassignedStudents.length} student
                        {unassignedStudents.length !== 1 ? 's' : ''} need to be
                        assigned to a class
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-warning-700" />
                </div>
              </button>
            </motion.div>
          )}

          {/* Class Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {classStats.map((classInfo: { className: string; section: string; fullName: string; studentCount: number }) => (
              <ClassCard
                key={classInfo.fullName}
                className={classInfo.className}
                section={classInfo.section}
                studentCount={classInfo.studentCount}
                onClick={() => handleClassClick(classInfo.fullName)}
              />
            ))}
          </div>
        </div>

        {/* Modals – must be rendered in this early-return branch too */}
        <AddStudentModal
          isOpen={addStudentOpen}
          onClose={() => setAddStudentOpen(false)}
        />
        <ImportModal
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
        />
        <ExportModal
          isOpen={exportOpen}
          onClose={() => setExportOpen(false)}
        />
        <ImportHistoryModal
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
      </div>
    );
  }

  // Detail view: Show students in selected class or unassigned
  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={handleBackToClasses}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-secondary-900">
                {showUnassigned
                  ? 'Unassigned Students'
                  : `Class ${selectedClass}`}
              </h1>
              <p className="text-secondary-600">
                {filteredStudents.length} student
                {filteredStudents.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {showUnassigned && (
              <Button variant="primary" onClick={() => {}}>
                Assign to Class
              </Button>
            )}
            <ViewToggle view={viewMode} onViewChange={setViewMode} />
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <SearchBar
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, roll number, or email..."
          />
        </div>

        {/* Students Display */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStudents.map((student: Student) => (
              <StudentCard
                key={student.id}
                {...student}
                class={student.class || 'Unassigned'}
                onClick={() => handleStudentClick(student)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-soft overflow-hidden">
            <Table
              data={filteredStudents}
              columns={columns}
              onRowClick={handleStudentClick}
            />
          </div>
        )}

        {filteredStudents.length === 0 && (
          <div className="bg-white rounded-xl shadow-soft p-12 text-center">
            <p className="text-secondary-500">No students found</p>
          </div>
        )}
      </div>

      {/* Student Profile Modal */}
      <AnimatePresence>
        {selectedStudent && (
          <Modal
            isOpen={!!selectedStudent}
            onClose={() => setSelectedStudent(null)}
            title="Student Profile"
            size="lg"
          >
            <div className="space-y-6">
              <div className="flex items-center gap-4 pb-6 border-b border-secondary-200">
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-3xl font-bold text-primary-700">
                    {selectedStudent.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-secondary-900">
                    {selectedStudent.name}
                  </h2>
                  <p className="text-secondary-600">
                    Roll No: {selectedStudent.rollNo}
                  </p>
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
                  <p className="text-secondary-900">
                    {new Date(selectedStudent.dateOfBirth).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-secondary-500 mb-1">Address</p>
                  <p className="text-secondary-900">{selectedStudent.address}</p>
                </div>
              </div>

              <div className="pt-6 border-t border-secondary-200">
                <h3 className="font-semibold text-secondary-900 mb-3">
                  Guardian Information
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-secondary-500 mb-1">
                      Guardian Name
                    </p>
                    <p className="text-secondary-900">
                      {selectedStudent.guardianName}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-secondary-500 mb-1">
                      Guardian Phone
                    </p>
                    <p className="text-secondary-900">
                      {selectedStudent.guardianPhone}
                    </p>
                  </div>
                </div>
              </div>

              {selectedStudent.assignedClasses.length > 0 && (
                <div className="pt-6 border-t border-secondary-200">
                  <h3 className="font-semibold text-secondary-900 mb-3">
                    Enrolled Subjects
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedStudent.assignedClasses.map((subject: string, idx: number) => (
                      <Badge key={idx} label={subject} color="primary" />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-6 border-t border-secondary-200">
                <Button variant="primary" className="flex-1">
                  Edit Profile
                </Button>
                <Button variant="danger" className="flex-1">
                  Remove Student
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AddStudentModal
        isOpen={addStudentOpen}
        onClose={() => setAddStudentOpen(false)}
      />
      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
      />
      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
      />
      <ImportHistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
};

export default StudentList;
