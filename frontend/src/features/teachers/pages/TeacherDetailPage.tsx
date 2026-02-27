import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit3, Calendar, Clock, CheckCircle2, XCircle, AlertCircle, Mail, Phone, Briefcase, BookOpen, Users, GraduationCap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../../../components/Button';
import { apiCallJSON, getAuthHeaders } from '../../../utils/api';
import logger from '../../../utils/logger';
import AddTeacherModal from '../components/AddTeacherModal';

interface AttendanceRecord {
  _id?: string;
  teacher_id: string;
  date: string;
  status: 'present' | 'absent' | 'late';
  check_in_time?: string;
  notes?: string;
  created_at?: string;
}

const TeacherDetailPage: React.FC = () => {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'edit' | 'attendance'>('attendance');
  const [editModalOpen, setEditModalOpen] = useState(false);
  
  // Attendance state
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [todayStatus, setTodayStatus] = useState<'present' | 'absent' | 'late' | null>(null);
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Load teacher details
  useEffect(() => {
    const loadTeacher = async () => {
      try {
        setLoading(true);
        logger.info('[TEACHERDETAILS]', 'Fetching all teachers from API');
        const data = await apiCallJSON('/teachers', { method: 'GET', headers: { ...getAuthHeaders() } });
        const teachers = Array.isArray(data) ? data : [];
        logger.info('[TEACHERDETAILS]', `Received ${teachers.length} teachers from API`);
        logger.debug('[TEACHERDETAILS]', `Searching for teacher ID: "${teacherId}" (type: ${typeof teacherId})`);
        
        // Log all available teacher IDs for debugging
        if (teachers.length > 0) {
          logger.debug('[TEACHERDETAILS]', `First teacher data keys: ${Object.keys(teachers[0]).join(', ')}`);
          teachers.forEach((t: any, idx: number) => {
            logger.debug('[TEACHERDETAILS]', `Teacher ${idx}: cnic="${t.cnic}", teacherId="${t.teacherId}", teacher_id="${t.teacher_id}", _id="${t._id}", id="${t.id}"`);
          });
        }
        
        const found = teachers.find((t: any) => 
          t.cnic === teacherId || 
          t.teacherId === teacherId || 
          t.teacher_id === teacherId ||
          String(t.id) === teacherId ||
          String(t._id) === teacherId
        );
        
        if (found) {
          setTeacher(found);
          logger.info('[TEACHERDETAILS]', `✅ Loaded teacher: ${found.name} (ID match field: ${Object.keys(found).find(k => found[k] === teacherId)})`);
        } else {
          logger.warn('[TEACHERDETAILS]', `❌ Teacher "${teacherId}" not found in ${teachers.length} records`);
        }
      } catch (err) {
        logger.error('[TEACHERDETAILS]', `❌ Error loading teacher: ${String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    if (teacherId) {
      loadTeacher();
    }
  }, [teacherId]);

  // Load attendance records
  useEffect(() => {
    if (activeTab === 'attendance' && teacherId) {
      loadAttendanceRecords();
    }
  }, [activeTab, teacherId]);

  const loadAttendanceRecords = async () => {
    try {
      setAttendanceLoading(true);
      const data = await apiCallJSON(`/teacher-attendance/${teacherId}`, { 
        method: 'GET', 
        headers: { ...getAuthHeaders() } 
      });
      const records = Array.isArray(data) ? data : [];
      setAttendanceRecords(records);
      
      // Check today's status
      const today = new Date().toISOString().split('T')[0];
      const todayRecord = records.find((r: AttendanceRecord) => r.date === today);
      setTodayStatus(todayRecord?.status || null);
    } catch (err) {
      logger.error('TEACHERDETAILS', `Error loading attendance: ${String(err)}`);
      setAttendanceRecords([]);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const markAttendance = async (status: 'present' | 'absent' | 'late') => {
    if (!teacherId) return;
    
    try {
      setSavingAttendance(true);
      const date = selectedDate;
      const check_in_time = new Date().toISOString();
      
      await apiCallJSON('/teacher-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          teacher_id: teacherId,
          date,
          status,
          check_in_time
        })
      });
      
      logger.info('TEACHERDETAILS', `Marked ${teacher?.name} as ${status} for ${date}`);
      
      // Update local state
      if (date === new Date().toISOString().split('T')[0]) {
        setTodayStatus(status);
      }
      
      // Reload records
      await loadAttendanceRecords();
    } catch (err) {
      logger.error('TEACHERDETAILS', `Failed to mark attendance: ${String(err)}`);
    } finally {
      setSavingAttendance(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'bg-green-100 text-green-700 border-green-200';
      case 'late': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'absent': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present': return <CheckCircle2 className="w-4 h-4" />;
      case 'late': return <AlertCircle className="w-4 h-4" />;
      case 'absent': return <XCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  // Calculate attendance stats
  const stats = React.useMemo(() => {
    const present = attendanceRecords.filter(r => r.status === 'present').length;
    const late = attendanceRecords.filter(r => r.status === 'late').length;
    const absent = attendanceRecords.filter(r => r.status === 'absent').length;
    const total = present + late + absent;
    const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { present, late, absent, total, percentage };
  }, [attendanceRecords]);

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="min-h-screen bg-secondary-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-soft p-12 text-center">
            <p className="text-secondary-500 text-lg">Teacher not found</p>
            <Button variant="secondary" className="mt-4" onClick={() => navigate('/teachers')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Teachers
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const imageUrl = teacher.profileImageUrl || (teacher.profile_image_blob 
    ? `data:${teacher.profile_image_type || 'image/jpeg'};base64,${teacher.profile_image_blob}` 
    : null);

  const classes = teacher.assigned_classes || teacher.assignedClasses || [];
  const subjects = teacher.subjects || [];

  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/teachers')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>

        {/* Teacher Profile Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6"
        >
          {/* Banner */}
          <div className="h-32 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 relative">
            <div className="absolute inset-0 bg-black/10" />
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }} />
          </div>

          {/* Profile Content */}
          <div className="px-8 pb-8 -mt-16 relative">
            <div className="flex items-end gap-6 mb-6">
              {imageUrl ? (
                <div className="w-28 h-28 rounded-2xl overflow-hidden flex-shrink-0 shadow-xl border-4 border-white bg-white">
                  <img src={imageUrl} alt={teacher.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-28 h-28 bg-gradient-to-br from-amber-100 to-amber-200 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xl border-4 border-white">
                  <GraduationCap className="w-14 h-14 text-amber-600" />
                </div>
              )}
              
              <div className="flex-1 pt-16">
                <h1 className="text-2xl font-bold text-gray-900">{teacher.name}</h1>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-1 rounded-lg">
                    {teacher.teacherId || teacher.teacher_id || 'No ID'}
                  </span>
                  {teacher.cnic && (
                    <span className="text-sm text-gray-600">CNIC: {teacher.cnic}</span>
                  )}
                </div>
              </div>

              <Button variant="primary" onClick={() => setEditModalOpen(true)}>
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Teacher
              </Button>
            </div>

            {/* Quick Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {teacher.email && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{teacher.email}</p>
                  </div>
                </div>
              )}
              {teacher.phone && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <Phone className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <p className="text-sm font-medium text-gray-900">{teacher.phone}</p>
                  </div>
                </div>
              )}
              {teacher.qualification && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <Briefcase className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Qualification</p>
                    <p className="text-sm font-medium text-gray-900">{teacher.qualification}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Users className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Classes</p>
                  <p className="text-sm font-medium text-gray-900">{classes.length} assigned</p>
                </div>
              </div>
            </div>

            {/* Subjects & Classes Tags */}
            {(subjects.length > 0 || classes.length > 0) && (
              <div className="mt-6 flex flex-wrap gap-6">
                {subjects.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-2 flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" /> Subjects
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {subjects.map((subject: string, idx: number) => (
                        <span key={idx} className="text-sm bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-medium border border-emerald-100">
                          {subject}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {classes.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-2 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> Classes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {classes.map((cls: string, idx: number) => (
                        <span key={idx} className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium border border-blue-100">
                          {cls}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
              activeTab === 'attendance'
                ? 'bg-amber-500 text-white shadow-lg'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Attendance
          </button>
        </div>

        {/* Attendance Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'attendance' && (
            <motion.div
              key="attendance"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Mark Attendance Section */}
              <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  Mark Attendance
                </h2>
                
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Date</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div className="flex-1">
                    <label className="text-sm text-gray-600 block mb-1">Status</label>
                    <div className="flex gap-3">
                      <button
                        onClick={() => markAttendance('present')}
                        disabled={savingAttendance}
                        className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                          todayStatus === 'present' && selectedDate === new Date().toISOString().split('T')[0]
                            ? 'bg-green-500 text-white shadow-lg'
                            : 'bg-green-50 text-green-700 hover:bg-green-100 border-2 border-green-200'
                        }`}
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        Present
                      </button>
                      <button
                        onClick={() => markAttendance('late')}
                        disabled={savingAttendance}
                        className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                          todayStatus === 'late' && selectedDate === new Date().toISOString().split('T')[0]
                            ? 'bg-yellow-500 text-white shadow-lg'
                            : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border-2 border-yellow-200'
                        }`}
                      >
                        <AlertCircle className="w-5 h-5" />
                        Late
                      </button>
                      <button
                        onClick={() => markAttendance('absent')}
                        disabled={savingAttendance}
                        className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                          todayStatus === 'absent' && selectedDate === new Date().toISOString().split('T')[0]
                            ? 'bg-red-500 text-white shadow-lg'
                            : 'bg-red-50 text-red-700 hover:bg-red-100 border-2 border-red-200'
                        }`}
                      >
                        <XCircle className="w-5 h-5" />
                        Absent
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendance Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <p className="text-gray-500 text-sm">Total Days</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                  <p className="text-green-600 text-sm">Present</p>
                  <p className="text-2xl font-bold text-green-700">{stats.present}</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
                  <p className="text-yellow-600 text-sm">Late</p>
                  <p className="text-2xl font-bold text-yellow-700">{stats.late}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                  <p className="text-red-600 text-sm">Absent</p>
                  <p className="text-2xl font-bold text-red-700">{stats.absent}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                  <p className="text-amber-600 text-sm">Attendance %</p>
                  <p className="text-2xl font-bold text-amber-700">{stats.percentage}%</p>
                </div>
              </div>

              {/* Attendance History */}
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Attendance History</h2>
                
                {attendanceLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500"></div>
                  </div>
                ) : attendanceRecords.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No attendance records yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-3 px-4 text-gray-600 font-medium">Date</th>
                          <th className="text-left py-3 px-4 text-gray-600 font-medium">Status</th>
                          <th className="text-left py-3 px-4 text-gray-600 font-medium">Check-in Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceRecords
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .slice(0, 20)
                          .map((record, idx) => (
                          <tr key={record._id || idx} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <span className="font-medium text-gray-900">
                                {new Date(record.date).toLocaleDateString('en-US', { 
                                  weekday: 'short', 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(record.status)}`}>
                                {getStatusIcon(record.status)}
                                {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-gray-600">
                              {record.check_in_time 
                                ? new Date(record.check_in_time).toLocaleTimeString('en-US', { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })
                                : '-'
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Edit Teacher Modal */}
      <AddTeacherModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        teacher={teacher}
        onTeacherAdded={() => {}}
        onTeacherUpdated={() => {
          setEditModalOpen(false);
          // Reload teacher data
          window.location.reload();
        }}
      />
    </div>
  );
};

export default TeacherDetailPage;
