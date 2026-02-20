import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import Button from '../../../components/Button';
import { getAttendanceForDate, markAttendance } from '../services/attendanceApi';
import api from '../../../utils/api';
import logger from '../../../utils/logger';

interface StudentAttendance {
  id: string;
  student_id: string;
  full_name: string;
  roll_number: string;
  status: 'present' | 'absent' | 'late';
  saved?: boolean;
  saving?: boolean;
  updated_at?: string | null;
}

const MarkAttendance: React.FC = () => {
  const { classId, date } = useParams<{ classId: string; date: string }>();
  const navigate = useNavigate();

  const [students, setStudents] = useState<StudentAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load students and existing attendance
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setSaveError(null);

        if (!classId || !date) {
          logger.error('MARKATTENDANCE', 'Missing classId or date');
          return;
        }

        // Fetch all students in this class
        logger.info('MARKATTENDANCE', `Fetching students for class ${classId}`);
        const allStudentsResponse = await api.get(`/api/students?class_id=${classId}`);
        const allStudents = Array.isArray(allStudentsResponse) ? allStudentsResponse : allStudentsResponse?.items || [];
        
        if (!Array.isArray(allStudents)) {
          logger.error('MARKATTENDANCE', 'Invalid students response');
          setStudents([]);
          return;
        }

        // Initialize with default "absent" status
        let studentList: StudentAttendance[] = allStudents
          .filter((s: any) => s.status === 'active')
          .sort((a: any, b: any) => {
            const aRoll = parseInt(a.roll_number || '999');
            const bRoll = parseInt(b.roll_number || '999');
            return aRoll - bRoll;
          })
          .map((s: any) => ({
            id: s.id || s._id,
            student_id: s.student_id,
            full_name: s.full_name || s.name || 'Unknown',
            roll_number: s.roll_number || '-',
            status: 'absent',
            saved: false,
            saving: false
          }));

        // Load existing attendance for this date
        logger.info('MARKATTENDANCE', `Fetching existing attendance for ${date}`);
        try {
          const existingRecords = await getAttendanceForDate(classId, date);
          if (Array.isArray(existingRecords)) {
            const recordMap: Record<string, any> = {};
            existingRecords.forEach((r: any) => {
              recordMap[r.student_id] = r.status;
            });

            // Pre-fill existing attendance
            studentList = studentList.map(s => ({
              ...s,
              status: (recordMap[s.student_id] || 'absent') as 'present' | 'absent' | 'late',
              saved: !!recordMap[s.student_id]
            }));
          }
        } catch (err) {
          logger.debug('MARKATTENDANCE', 'No existing records for this date');
        }

        setStudents(studentList);
        logger.info('MARKATTENDANCE', `Loaded ${studentList.length} students`);
      } catch (err) {
        logger.error('MARKATTENDANCE', `Error loading data: ${String(err)}`);
        setSaveError('Failed to load students');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [classId, date]);

  const handleStatusChange = async (
    idx: number,
    newStatus: 'present' | 'absent' | 'late'
  ) => {
    const updatedStudents = [...students];
    updatedStudents[idx].status = newStatus;
    updatedStudents[idx].saving = true;
    setStudents(updatedStudents);

    try {
      const student = updatedStudents[idx];
      logger.info('MARKATTENDANCE', `Saving ${student.full_name}: ${newStatus}`);

        const record = await markAttendance({
        class_id: classId!,
        student_id: student.student_id,
        date: date!,
        status: newStatus
        });

        updatedStudents[idx].saving = false;
        updatedStudents[idx].saved = true;
        // Store returned updated_at if available
        if (record && (record as any).updated_at) {
          updatedStudents[idx].updated_at = (record as any).updated_at;
        }
      setStudents(updatedStudents);
        logger.info('MARKATTENDANCE', `✅ Saved attendance for ${student.full_name}`);
    } catch (err) {
      updatedStudents[idx].saving = false;
      setStudents(updatedStudents);
        logger.error('MARKATTENDANCE', `Error saving attendance: ${String(err)}`);
        setSaveError(`Could not save attendance for ${students[idx].full_name}. Please try again.`);
    }
  };

  const fileDate = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'Unknown Date';

  const presentCount = students.filter(s => s.status === 'present').length;
  const absentCount = students.filter(s => s.status === 'absent').length;
  const lateCount = students.filter(s => s.status === 'late').length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading students...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-secondary-50">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <div className="mb-6">
          <Button variant="secondary" onClick={() => navigate(`/classes/${classId}/attendance`)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Attendance
          </Button>
        </div>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Mark Attendance</h1>
          <p className="text-gray-600 mb-4">{fileDate}</p>

          {/* Quick Stats */}
          <div className="flex gap-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-sm text-gray-700">
                Present: <span className="font-bold">{presentCount}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
              <span className="text-sm text-gray-700">
                Absent: <span className="font-bold">{absentCount}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-yellow-500"></span>
              <span className="text-sm text-gray-700">
                Late: <span className="font-bold">{lateCount}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {saveError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {saveError}
          </div>
        )}

        {/* Students List */}
        {students.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-gray-600">No active students in this class</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm">
            {/* Header Row */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b font-semibold text-gray-900 bg-gray-50">
              <div className="col-span-7">Student Name</div>
              <div className="col-span-3 inline-flex justify-center">Status</div>
              <div className="col-span-2">Status</div>
            </div>

            {/* Student Rows */}
            {students.map((student, idx) => (
              <div
                key={student.id}
                className="grid grid-cols-12 gap-4 px-6 py-4 border-b hover:bg-gray-50 items-center"
              >
                {/* Student Info */}
                <div className="col-span-7">
                  <div className="font-medium text-gray-900">{student.full_name}</div>
                  <div className="text-xs text-gray-600">Roll: {student.roll_number}</div>
                </div>

                {/* Status Buttons */}
                <div className="col-span-3 flex gap-2 justify-center">
                  <button
                    onClick={() => handleStatusChange(idx, 'present')}
                    disabled={student.saving}
                    className={`px-3 py-2 rounded text-xs font-medium transition ${
                      student.status === 'present'
                        ? 'bg-green-600 text-white'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    } ${student.saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Mark as Present"
                  >
                    P
                  </button>
                  <button
                    onClick={() => handleStatusChange(idx, 'absent')}
                    disabled={student.saving}
                    className={`px-3 py-2 rounded text-xs font-medium transition ${
                      student.status === 'absent'
                        ? 'bg-red-600 text-white'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    } ${student.saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Mark as Absent"
                  >
                    A
                  </button>
                  <button
                    onClick={() => handleStatusChange(idx, 'late')}
                    disabled={student.saving}
                    className={`px-3 py-2 rounded text-xs font-medium transition ${
                      student.status === 'late'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                    } ${student.saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Mark as Late"
                  >
                    L
                  </button>
                </div>

                {/* Status Indicator */}
                <div className="col-span-2 text-right">
                  {student.saving ? (
                    <span className="text-xs text-blue-600">Updating...</span>
                  ) : student.saved ? (
                    <span className="text-xs text-green-600 flex items-center justify-end gap-1">
                      <Check className="w-3 h-3" /> Updated
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarkAttendance;
