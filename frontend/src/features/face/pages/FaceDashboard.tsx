/**
 * Face Recognition Dashboard - Redesigned
 * Clean, minimalistic dashboard with real-time statistics and visualizations
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  Clock,
  Settings,
  Video,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  UserX,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  getCombinedDashboard,
} from '../services/faceApi';
import type {
  TodaySummary,
  StudentAttendanceDetail,
  TeacherAttendanceDetail,
  HourlyStats,
  LateArrival,
  AbsentGroup,
} from '../types';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import logger from '../../../utils/logger';

const SOFT_COLORS = {
  present: '#34d399',
  late: '#fbbf24',
  absent: '#f87171',
  checkedOut: '#60a5fa',
  bg: {
    blue: 'from-blue-400 to-blue-500',
    green: 'from-emerald-400 to-emerald-500',
    purple: 'from-purple-400 to-purple-500',
    orange: 'from-amber-400 to-amber-500',
  }
};

const FaceDashboard: React.FC = () => {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [students, setStudents] = useState<StudentAttendanceDetail[]>([]);
  const [teachers, setTeachers] = useState<TeacherAttendanceDetail[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyStats | null>(null);
  const [lateStudents, setLateStudents] = useState<LateArrival[]>([]);
  const [lateTeachers, setLateTeachers] = useState<LateArrival[]>([]);
  const [absentGroups, setAbsentGroups] = useState<AbsentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'students' | 'teachers'>('students');
  const [lateTab, setLateTab] = useState<'students' | 'teachers'>('students');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  
  // Ref to prevent duplicate fetches
  const isFetchingRef = useRef(false);
  const mountedRef = useRef(false);

  const fetchDashboardData = useCallback(async () => {
    // Prevent duplicate concurrent fetches
    if (isFetchingRef.current) {
      logger.info('FACE DASHBOARD', 'Fetch already in progress, skipping...');
      return;
    }
    
    isFetchingRef.current = true;
    
    try {
      // OPTIMIZED: Single combined API call instead of 7 separate calls
      // Combined with request deduplication to prevent duplicate calls
      logger.info('FACE DASHBOARD', 'Fetching combined dashboard data...');
      
      const combinedData = await getCombinedDashboard();
      
      // Update all state from single response
      setSummary(combinedData.summary);
      setStudents(combinedData.students);
      setTeachers(combinedData.teachers);
      setHourlyStats(combinedData.hourly_stats);
      setLateStudents(combinedData.late_students);
      setLateTeachers(combinedData.late_teachers);
      setAbsentGroups(combinedData.absent_groups);
      
      logger.info(
        'FACE DASHBOARD',
        `Data loaded successfully from ${combinedData.cached_at ? 'cache' : 'database'}`
      );
    } catch (err) {
      logger.error('FACE DASHBOARD', `Failed to load data: ${err}`);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []); // Empty deps - function never changes

  useEffect(() => {
    // Only fetch once on mount
    if (!mountedRef.current) {
      mountedRef.current = true;
      fetchDashboardData();
    }

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000);
    
    return () => {
      clearInterval(interval);
    };
  }, []); // Empty deps - only run on mount/unmount

  const toggleClass = (classKey: string) => {
    const newExpanded = new Set(expandedClasses);
    if (newExpanded.has(classKey)) {
      newExpanded.delete(classKey);
    } else {
      newExpanded.add(classKey);
    }
    setExpandedClasses(newExpanded);
  };

  const filteredData = () => {
    const data = activeTab === 'students' ? students : teachers;
    if (!searchQuery) return data;

    return data.filter((record: any) =>
      record.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (activeTab === 'students' && record.student_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (activeTab === 'teachers' && record.teacher_id.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  // Prepare chart data
  const studentStatusData = summary
    ? [
        { name: 'Present', value: summary.students.present, color: SOFT_COLORS.present },
        { name: 'Late', value: summary.students.late, color: SOFT_COLORS.late },
        { name: 'Absent', value: summary.students.absent, color: SOFT_COLORS.absent },
      ]
    : [];

  const teacherStatusData = summary
    ? [
        { name: 'Present', value: summary.teachers.present, color: SOFT_COLORS.present },
        { name: 'Late', value: summary.teachers.late, color: SOFT_COLORS.late },
        { name: 'Absent', value: summary.teachers.absent, color: SOFT_COLORS.absent },
      ]
    : [];

  const hourlyChartData = hourlyStats
    ? hourlyStats.hours.map((hour, index) => ({
        time: hour,
        Students: hourlyStats.students[index],
        Teachers: hourlyStats.teachers[index],
      }))
    : [];

  return (
    <div className="min-h-screen bg-secondary-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-secondary-900">Face Recognition Dashboard</h1>
              <p className="text-secondary-500 mt-1 text-sm">Real-time attendance monitoring</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/face-app/settings"
                className="flex items-center gap-2 px-3 py-2 bg-white border border-secondary-200 text-secondary-700 rounded-lg hover:bg-secondary-50 transition-colors text-sm"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </Link>
              <Link
                to="/face-app/multi-camera"
                className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm"
              >
                <Video className="w-4 h-4" />
                Start Recognition
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-gradient-to-br ${SOFT_COLORS.bg.blue} rounded-lg p-4 text-white shadow-md`}
          >
            <div className="flex items-start justify-between mb-2">
              <Users className="w-7 h-7 opacity-80" />
              <div className="text-right">
                <p className="text-2xl font-bold">{summary?.students.checked_in || 0}</p>
                <p className="text-blue-100 text-xs">of {summary?.students.total || 0}</p>
              </div>
            </div>
            <p className="text-blue-50 text-sm font-medium">Students In</p>
            <div className="mt-1 text-xs font-medium">{summary?.students.attendance_rate || 0}%</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`bg-gradient-to-br ${SOFT_COLORS.bg.green} rounded-lg p-4 text-white shadow-md`}
          >
            <div className="flex items-start justify-between mb-2">
              <CheckCircle2 className="w-7 h-7 opacity-80" />
              <div className="text-right">
                <p className="text-2xl font-bold">{summary?.students.checked_out || 0}</p>
                <p className="text-emerald-100 text-xs">checked out</p>
              </div>
            </div>
            <p className="text-emerald-50 text-sm font-medium">Students Out</p>
            <div className="mt-1 text-xs font-medium">Completed</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`bg-gradient-to-br ${SOFT_COLORS.bg.purple} rounded-lg p-4 text-white shadow-md`}
          >
            <div className="flex items-start justify-between mb-2">
              <Briefcase className="w-7 h-7 opacity-80" />
              <div className="text-right">
                <p className="text-2xl font-bold">{summary?.teachers.checked_in || 0}</p>
                <p className="text-purple-100 text-xs">of {summary?.teachers.total || 0}</p>
              </div>
            </div>
            <p className="text-purple-50 text-sm font-medium">Teachers In</p>
            <div className="mt-1 text-xs font-medium">{summary?.teachers.attendance_rate || 0}%</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`bg-gradient-to-br ${SOFT_COLORS.bg.orange} rounded-lg p-4 text-white shadow-md`}
          >
            <div className="flex items-start justify-between mb-2">
              <AlertCircle className="w-7 h-7 opacity-80" />
              <div className="text-right">
                <p className="text-2xl font-bold">{(summary?.students.late || 0) + (summary?.teachers.late || 0)}</p>
                <p className="text-amber-100 text-xs">total late</p>
              </div>
            </div>
            <p className="text-amber-50 text-sm font-medium">Late Arrivals</p>
            <div className="mt-1 text-xs font-medium">{summary?.students.late || 0}S + {summary?.teachers.late || 0}T</div>
          </motion.div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Hourly Check-in Chart */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-base font-semibold text-secondary-900 mb-3">Hourly Check-in</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={hourlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" stroke="#6b7280" style={{ fontSize: '11px' }} />
                <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                <Tooltip contentStyle={{ fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="Students" stroke="#60a5fa" strokeWidth={2} />
                <Line type="monotone" dataKey="Teachers" stroke="#a78bfa" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Status Distribution */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-base font-semibold text-secondary-900 mb-3">Status Distribution</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <h3 className="text-xs font-medium text-secondary-600 mb-2 text-center">Students</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={studentStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ value }) => (value > 0 ? `${value}` : '')}
                      outerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {studentStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h3 className="text-xs font-medium text-secondary-600 mb-2 text-center">Teachers</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={teacherStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ value }) => (value > 0 ? `${value}` : '')}
                      outerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {teacherStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Late Arrivals Section */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-secondary-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Late Arrivals Overview
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setLateTab('students')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  lateTab === 'students'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-secondary-600 hover:bg-secondary-100'
                }`}
              >
                Students ({lateStudents.length})
              </button>
              <button
                onClick={() => setLateTab('teachers')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  lateTab === 'teachers'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-secondary-600 hover:bg-secondary-100'
                }`}
              >
                Teachers ({lateTeachers.length})
              </button>
            </div>
          </div>

          {lateTab === 'students' ? (
            lateStudents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary-50">
                    <tr className="text-left text-xs text-secondary-600">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium hidden md:table-cell">Father Name</th>
                      <th className="px-3 py-2 font-medium">Class</th>
                      <th className="px-3 py-2 font-medium hidden sm:table-cell">Roll No</th>
                      <th className="px-3 py-2 font-medium">Check-in</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary-100">
                    {lateStudents.map((student, idx) => (
                      <tr key={idx} className="hover:bg-secondary-50">
                        <td className="px-3 py-2 text-secondary-900">{student.name}</td>
                        <td className="px-3 py-2 text-secondary-600 hidden md:table-cell">{student.father_name}</td>
                        <td className="px-3 py-2 text-secondary-600">
                          {student.class_id}-{student.section}
                        </td>
                        <td className="px-3 py-2 text-secondary-600 hidden sm:table-cell">{student.roll_number}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs font-medium">
                            <Clock className="w-3 h-3" />
                            {student.check_in_time}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-secondary-500 text-sm">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
                <p>No late student arrivals today!</p>
              </div>
            )
          ) : lateTeachers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary-50">
                  <tr className="text-left text-xs text-secondary-600">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium hidden md:table-cell">Email</th>
                    <th className="px-3 py-2 font-medium hidden sm:table-cell">Department</th>
                    <th className="px-3 py-2 font-medium">Check-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100">
                  {lateTeachers.map((teacher, idx) => (
                    <tr key={idx} className="hover:bg-secondary-50">
                      <td className="px-3 py-2 text-secondary-900">{teacher.name}</td>
                      <td className="px-3 py-2 text-secondary-600 hidden md:table-cell">{teacher.email}</td>
                      <td className="px-3 py-2 text-secondary-600 hidden sm:table-cell">{teacher.department}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs font-medium">
                          <Clock className="w-3 h-3" />
                          {teacher.check_in_time}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-secondary-500 text-sm">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
              <p>No late teacher arrivals today!</p>
            </div>
          )}
        </div>

        {/* Absent Students Tracker */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-secondary-900 flex items-center gap-2">
              <UserX className="w-5 h-5 text-red-500" />
              Absent Students Tracker
            </h2>
            <span className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium">
              {absentGroups.reduce((sum, g) => sum + g.absent_count, 0)} Total Absent
            </span>
          </div>

          {absentGroups.length > 0 ? (
            <div className="space-y-2">
              {absentGroups.map((group) => {
                const classKey = `${group.class_id}-${group.section}`;
                const isExpanded = expandedClasses.has(classKey);

                return (
                  <div key={classKey} className="border border-secondary-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleClass(classKey)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-secondary-50 hover:bg-secondary-100 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-secondary-900 text-sm">
                          Class {group.class_id}-{group.section}
                        </span>
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                          {group.absent_count} absent
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-secondary-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-secondary-600" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="p-4 bg-white">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {group.students.map((student) => (
                            <div
                              key={student.student_id}
                              className="flex items-start gap-3 p-3 border border-secondary-200 rounded-lg"
                            >
                              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <UserX className="w-4 h-4 text-red-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-secondary-900 truncate">{student.name}</p>
                                <p className="text-xs text-secondary-600">Father: {student.father_name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-secondary-500">Roll: {student.roll_number}</span>
                                  <span className="text-xs text-secondary-400">•</span>
                                  <span className="text-xs text-secondary-500">{student.registration_number}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-secondary-500 text-sm">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
              <p>Perfect attendance! No absent students today.</p>
            </div>
          )}
        </div>

        {/* Detailed Records Table */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold text-secondary-900">Attendance Records</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('students')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'students'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-secondary-600 hover:bg-secondary-100'
                }`}
              >
                Students
              </button>
              <button
                onClick={() => setActiveTab('teachers')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'teachers'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-secondary-600 hover:bg-secondary-100'
                }`}
              >
                Teachers
              </button>
            </div>
          </div>

          <div className="mb-4">
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary-50">
                <tr className="text-left text-xs text-secondary-600">
                  <th className="px-3 py-2 font-medium">Name</th>
                  {activeTab === 'students' ? (
                    <>
                      <th className="px-3 py-2 font-medium hidden lg:table-cell">Father</th>
                      <th className="px-3 py-2 font-medium">Class</th>
                      <th className="px-3 py-2 font-medium hidden md:table-cell">Roll</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 font-medium hidden lg:table-cell">Email</th>
                      <th className="px-3 py-2 font-medium hidden md:table-cell">Department</th>
                    </>
                  )}
                  <th className="px-3 py-2 font-medium">Check-in</th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">Check-out</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary-100">
                {filteredData().map((record: any, idx) => (
                  <tr key={idx} className="hover:bg-secondary-50">
                    <td className="px-3 py-2 text-secondary-900 font-medium">{record.name}</td>
                    {activeTab === 'students' ? (
                      <>
                        <td className="px-3 py-2 text-secondary-600 hidden lg:table-cell">
                          {record.father_name}
                        </td>
                        <td className="px-3 py-2 text-secondary-600">
                          {record.class_id}-{record.section}
                        </td>
                        <td className="px-3 py-2 text-secondary-600 hidden md:table-cell">
                          {record.roll_number}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-secondary-600 hidden lg:table-cell">{record.email}</td>
                        <td className="px-3 py-2 text-secondary-600 hidden md:table-cell">
                          {record.department}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-secondary-600">{record.check_in_time || 'N/A'}</td>
                    <td className="px-3 py-2 text-secondary-600 hidden sm:table-cell">
                      {record.check_out_time || '-'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          record.status === 'present'
                            ? 'bg-emerald-50 text-emerald-700'
                            : record.status === 'late'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredData().length === 0 && (
              <div className="text-center py-8 text-secondary-500 text-sm">
                <UserX className="w-12 h-12 mx-auto mb-2 text-secondary-300" />
                <p>No {activeTab} records found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaceDashboard;
