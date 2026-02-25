import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
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
  AreaChart,
  Area
} from 'recharts';
import {
  Users,
  GraduationCap,
  DollarSign,
  AlertTriangle,
  Camera,
  Loader2,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import {
  analyticsService,
  DashboardOverview,
  AttendanceSummary,
  FeeSummary,
  ClassAttendance,
  EnrollmentTrend
} from '../services/analytics';

const AnalyticsDashboard: React.FC = () => {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [fees, setFees] = useState<FeeSummary | null>(null);
  const [classAttendance, setClassAttendance] = useState<ClassAttendance[]>([]);
  const [enrollment, setEnrollment] = useState<EnrollmentTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attendanceDays, setAttendanceDays] = useState(30);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    loadAttendanceData();
  }, [attendanceDays]);

  async function loadAllData() {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, attendanceData, feesData, classAttendanceData, enrollmentData] = await Promise.all([
        analyticsService.getDashboardOverview(),
        analyticsService.getAttendanceSummary(attendanceDays),
        analyticsService.getFeeSummary(),
        analyticsService.getClassWiseAttendance(),
        analyticsService.getEnrollmentTrends()
      ]);

      setOverview(overviewData);
      setAttendance(attendanceData);
      setFees(feesData);
      setClassAttendance(classAttendanceData);
      setEnrollment(enrollmentData);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }

  async function loadAttendanceData() {
    try {
      const data = await analyticsService.getAttendanceSummary(attendanceDays);
      setAttendance(data);
    } catch (err: any) {
      console.error('Failed to load attendance:', err);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadAllData}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
            </div>
            <p className="text-gray-600">Real-time insights and statistics for your school</p>
          </div>
          <button
            onClick={loadAllData}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Students</p>
                <p className="text-3xl font-bold text-gray-900">{overview?.total_students || 0}</p>
                <p className="text-xs text-green-600 mt-1">
                  {overview?.active_students || 0} active
                </p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-xl">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Teachers</p>
                <p className="text-3xl font-bold text-gray-900">{overview?.total_teachers || 0}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {overview?.total_classes || 0} classes
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-xl">
                <GraduationCap className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Fee Collection</p>
                <p className="text-3xl font-bold text-gray-900">
                  {formatPercentage(overview?.collection_rate || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatCurrency(overview?.total_fees_collected || 0)} collected
                </p>
              </div>
              <div className="p-3 bg-amber-100 rounded-xl">
                <DollarSign className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Face Recognition</p>
                <p className="text-3xl font-bold text-gray-900">
                  {overview?.students_with_images || 0}
                </p>
                <p className="text-xs text-red-600 mt-1">
                  {overview?.students_without_images || 0} missing photos
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-xl">
                <Camera className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Attendance Trend */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Attendance Trend</h3>
              <select
                value={attendanceDays}
                onChange={(e) => setAttendanceDays(Number(e.target.value))}
                className="px-3 py-1 border rounded-lg text-sm"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
              </select>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={attendance?.daily_breakdown || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  fontSize={12}
                />
                <YAxis fontSize={12} />
                <Tooltip 
                  labelFormatter={(v) => new Date(v).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                />
                <Legend />
                <Area type="monotone" dataKey="present" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Present" />
                <Area type="monotone" dataKey="absent" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Absent" />
                <Area type="monotone" dataKey="late" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="Late" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Fee Collection by Category */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Fee Collection by Category</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={fees?.by_category || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} fontSize={12} />
                <YAxis type="category" dataKey="category_name" fontSize={12} width={100} />
                <Tooltip formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''} />
                <Legend />
                <Bar dataKey="collected" fill="#10b981" name="Collected" />
                <Bar dataKey="pending" fill="#ef4444" name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Attendance by Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Attendance Overview</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Present', value: attendance?.present_count || 0 },
                    { name: 'Absent', value: attendance?.absent_count || 0 },
                    { name: 'Late', value: attendance?.late_count || 0 }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="text-center mt-2">
              <p className="text-2xl font-bold text-indigo-600">
                {formatPercentage(attendance?.attendance_rate || 0)}
              </p>
              <p className="text-sm text-gray-500">Attendance Rate</p>
            </div>
          </div>

          {/* Class Distribution */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Students per Class</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={enrollment?.class_distribution?.slice(0, 8) || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="class_name" 
                  fontSize={12}
                  tickFormatter={(v, i) => {
                    const item = enrollment?.class_distribution?.[i];
                    return item ? `${v}-${item.section}` : v;
                  }}
                />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="student_count" fill="#6366f1" name="Students" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Fee Collection Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Collection Status</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Collected', value: fees?.total_collected || 0 },
                    { name: 'Pending', value: fees?.total_pending || 0 }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2 text-center">
              <div>
                <p className="text-lg font-bold text-green-600">{formatCurrency(fees?.total_collected || 0)}</p>
                <p className="text-xs text-gray-500">Collected</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-600">{formatCurrency(fees?.total_pending || 0)}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Collection Trend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Monthly Fee Collection Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={fees?.monthly_collection || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                fontSize={12}
                tickFormatter={(v) => {
                  const [year, month] = v.split('-');
                  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short' });
                }}
              />
              <YAxis tickFormatter={(v) => formatCurrency(v)} fontSize={12} />
              <Tooltip formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="amount" 
                stroke="#6366f1" 
                strokeWidth={2}
                dot={{ fill: '#6366f1' }}
                name="Collection"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Class-wise Attendance Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Today's Class-wise Attendance</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Class</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Total Students</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Present</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Absent</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {classAttendance.map((cls) => (
                  <tr key={cls.class_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {cls.class_name} - {cls.section}
                    </td>
                    <td className="px-4 py-3 text-center">{cls.total_students}</td>
                    <td className="px-4 py-3 text-center text-green-600 font-medium">
                      {cls.present_today}
                    </td>
                    <td className="px-4 py-3 text-center text-red-600 font-medium">
                      {cls.absent_today}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        cls.attendance_rate >= 0.9 ? 'bg-green-100 text-green-700' :
                        cls.attendance_rate >= 0.7 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {formatPercentage(cls.attendance_rate)}
                      </span>
                    </td>
                  </tr>
                ))}
                {classAttendance.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No attendance data available for today
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
