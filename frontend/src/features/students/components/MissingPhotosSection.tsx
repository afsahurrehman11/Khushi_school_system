import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ChevronDown } from 'lucide-react';
import Modal from '../../../components/Modal';
import ImageUpload from './ImageUpload';
import { apiCallJSON } from '../../../utils/api';
import logger from '../../../utils/logger';

interface ClassMissingPhotos {
  class_id: string;
  missing_count: number;
  total_count: number;
  percentage_missing: number;
}

interface StudentWithoutPhoto {
  id: string;
  student_id: string;
  full_name: string;
  roll_number: string;
}

const MissingPhotosSection: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [classMissingPhotos, setClassMissingPhotos] = useState<ClassMissingPhotos[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [studentsWithoutPhotos, setStudentsWithoutPhotos] = useState<StudentWithoutPhoto[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithoutPhoto | null>(null);

  useEffect(() => {
    if (expanded) {
      fetchMissingPhotos();
    }
  }, [expanded]);

  const fetchMissingPhotos = async () => {
    setLoading(true);
    try {
      const data = await apiCallJSON('/api/students/photos/missing-summary');
      setClassMissingPhotos(data.data || []);
    } catch (err) {
      logger.error('PHOTOS', `Failed to fetch missing photos: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClassClick = async (classId: string) => {
    if (selectedClass === classId) {
      setSelectedClass(null);
      return;
    }

    setSelectedClass(classId);
    setLoadingStudents(true);
    try {
      const data = await apiCallJSON(`/api/students/photos/missing-by-class/${classId}`);
      setStudentsWithoutPhotos(data.students || []);
    } catch (err) {
      logger.error('PHOTOS', `Failed to fetch students without photos: ${String(err)}`);
    } finally {
      setLoadingStudents(false);
    }
  };

  const totalMissingPhotos = classMissingPhotos.reduce((sum, c) => sum + c.missing_count, 0);
  const hasAnyMissing = totalMissingPhotos > 0;

  if (!hasAnyMissing) {
    return null;
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full bg-warning-50 border border-warning-200 rounded-xl p-4 hover:bg-warning-100 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-warning-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-warning-900">Classes Missing Photos</h3>
                <p className="text-sm text-warning-700">
                  {totalMissingPhotos} student{totalMissingPhotos !== 1 ? 's' : ''} across{' '}
                  {classMissingPhotos.length} class{classMissingPhotos.length !== 1 ? 'es' : ''}
                </p>
              </div>
            </div>
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <ChevronDown className="w-5 h-5 text-warning-700" />
            </motion.div>
          </div>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-warning-50 border border-t-0 border-warning-200 rounded-b-xl p-4 space-y-2">
                {loading ? (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin">Loading...</div>
                  </div>
                ) : classMissingPhotos.length === 0 ? (
                  <div className="text-center py-4 text-warning-700">
                    No classes with missing photos
                  </div>
                ) : (
                  classMissingPhotos.map((classData) => (
                    <motion.div
                      key={classData.class_id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      <button
                        onClick={() => handleClassClick(classData.class_id)}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          selectedClass === classData.class_id
                            ? 'bg-warning-100'
                            : 'hover:bg-warning-100'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-warning-900">Class {classData.class_id}</p>
                            <p className="text-sm text-warning-700">
                              {classData.missing_count} of {classData.total_count} missing (
                              {classData.percentage_missing}%)
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                              <span className="text-lg font-bold text-warning-600">
                                {classData.missing_count}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>

                      <AnimatePresence>
                        {selectedClass === classData.class_id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-2 ml-4 border-l-2 border-warning-300 pl-2 space-y-1"
                          >
                            {loadingStudents ? (
                              <div className="text-sm text-warning-700 py-2">Loading students...</div>
                            ) : studentsWithoutPhotos.length === 0 ? (
                              <div className="text-sm text-warning-700 py-2">No students found</div>
                            ) : (
                              studentsWithoutPhotos.map((student) => (
                                <motion.div
                                  key={student.id}
                                  initial={{ opacity: 0, x: -5 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  className="flex items-center justify-between p-2 bg-white rounded-lg hover:bg-warning-50 transition-colors"
                                >
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-secondary-900">
                                      {student.full_name}
                                    </p>
                                    <p className="text-xs text-secondary-500">
                                      Roll: {student.roll_number}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => setSelectedStudent(student)}
                                    className="px-3 py-1 text-xs bg-warning-600 text-white rounded-lg hover:bg-warning-700 transition-colors"
                                  >
                                    Upload
                                  </button>
                                </motion.div>
                              ))
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {selectedStudent && (
          <Modal
            isOpen={!!selectedStudent}
            onClose={() => setSelectedStudent(null)}
            title={`Upload Photo - ${selectedStudent.full_name}`}
            size="sm"
          >
            <ImageUpload
              studentId={selectedStudent.id}
              onImageUploaded={() => {
                setSelectedStudent(null);
                fetchMissingPhotos();
              }}
            />
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
};

export default MissingPhotosSection;
