import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, BarChart3 } from 'lucide-react';
import Button from '../../../components/Button';
import { getAttendanceDates, getAttendanceSummary } from '../services/attendanceApi';
import logger from '../../../utils/logger';

const AttendanceList: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  
  const [dates, setDates] = useState<string[]>([]);
  const [todaySummary, setTodaySummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAttendanceData = async () => {
      try {
        setLoading(true);
        
        if (!classId) {
          logger.error('ATTENDANCE', 'No classId provided');
          return;
        }

        // Fetch dates
        const attendanceDates = await getAttendanceDates(classId);
        setDates(attendanceDates || []);
        logger.info('ATTENDANCE', `Loaded ${attendanceDates?.length || 0} attendance dates`);

        // Get today's summary
        const today = new Date().toISOString().split('T')[0];
        try {
          const summary = await getAttendanceSummary(classId, today);
          setTodaySummary(summary);
          logger.info('ATTENDANCE', `Today's summary loaded: ${summary.present_count}P, ${summary.absent_count}A`);
        } catch (err) {
          // Summary might not exist for today yet
          logger.debug('ATTENDANCE', 'No summary available for today');
        }
      } catch (err) {
        logger.error('ATTENDANCE', `Error loading data: ${String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    loadAttendanceData();
  }, [classId]);

  const handleMarkToday = () => {
    const today = new Date().toISOString().split('T')[0];
    navigate(`/classes/${classId}/attendance/${today}`);
  };

  const handleViewDate = (date: string) => {
    navigate(`/classes/${classId}/attendance/${date}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading attendance...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-secondary-50">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <div className="mb-6">
          <Button variant="secondary" onClick={() => navigate(`/classes/${classId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Class
          </Button>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Attendance Management</h1>
          <p className="text-gray-600">Daily attendance for this class</p>
        </div>

        {/* Today's Summary Stats */}
        {todaySummary && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Today's Summary</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-gray-600">Total Students</div>
                <div className="text-2xl font-bold text-blue-600">{todaySummary.total_students}</div>
              </div>
              
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-sm text-gray-600">Present</div>
                <div className="text-2xl font-bold text-green-600">{todaySummary.present_count}</div>
              </div>
              
              <div className="p-4 bg-red-50 rounded-lg">
                <div className="text-sm text-gray-600">Absent</div>
                <div className="text-2xl font-bold text-red-600">{todaySummary.absent_count}</div>
              </div>
              
              <div className="p-4 bg-yellow-50 rounded-lg">
                <div className="text-sm text-gray-600">Late</div>
                <div className="text-2xl font-bold text-yellow-600">{todaySummary.late_count}</div>
              </div>
            </div>

            {/* Attendance Percentage Bar */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Attendance Rate</span>
                <span className="text-sm font-bold text-gray-900">{todaySummary.attendance_percentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    todaySummary.attendance_percentage >= 80 ? 'bg-green-500' :
                    todaySummary.attendance_percentage >= 60 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(todaySummary.attendance_percentage, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Mark Today Button */}
        <div className="mb-6">
          <Button variant="primary" onClick={handleMarkToday}>
            <Plus className="w-4 h-4 mr-2" /> Mark Today's Attendance
          </Button>
        </div>

        {/* Previous Attendance Records */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-indigo-600" />
              Previous Records
            </h2>
          </div>
          
          {dates.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-gray-600">No attendance records yet. Start by marking today's attendance.</p>
            </div>
          ) : (
            <div className="divide-y">
              {dates.map((date, idx) => {
                // Format date
                const dateObj = new Date(date + 'T00:00:00');
                const formattedDate = dateObj.toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                });
                const isToday = date === new Date().toISOString().split('T')[0];

                return (
                  <div
                    key={idx}
                    className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition"
                    onClick={() => handleViewDate(date)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">
                          {formattedDate} {isToday && <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs ml-2">Today</span>}
                        </div>
                        <div className="text-sm text-gray-600">{date}</div>
                      </div>
                      <button className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                        View / Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceList;
