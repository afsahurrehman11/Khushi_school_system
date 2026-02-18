import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Button from '../../../components/Button';
import { getClasses } from '../services/classesApi';
import { getAttendanceDates, getAttendanceSummary } from '../services/attendanceApi';
import logger from '../../../utils/logger';

const ClassDetails: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [classData, setClassData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('attendance');
  const [dates, setDates] = useState<string[]>([]);
  const [todaySummary, setTodaySummary] = useState<any>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  useEffect(() => {
    const loadClass = async () => {
      try {
        setLoading(true);
        const classes = await getClasses();
        const found = classes.find((c: any) => c.id === classId || c._id === classId);
        if (found) {
          setClassData(found);
          logger.info('CLASSDETAILS', `Loaded class ${found.name || found.class_name}`);
        } else {
          logger.warn('CLASSDETAILS', `Class ${classId} not found`);
        }
      } catch (err) {
        logger.error('CLASSDETAILS', `Error loading class: ${String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    if (classId) {
      loadClass();
    }
  }, [classId]);

  // Load attendance data when attendance tab is active
  useEffect(() => {
    if (activeTab === 'attendance' && classId) {
      loadAttendanceData();
    }
  }, [activeTab, classId]);

  const loadAttendanceData = async () => {
    try {
      setAttendanceLoading(true);

      // Fetch dates
      const attendanceDates = await getAttendanceDates(classId!);
      setDates(attendanceDates || []);

      // Get today's summary
      const today = new Date().toISOString().split('T')[0];
      try {
        const summary = await getAttendanceSummary(classId!, today);
        setTodaySummary(summary);
      } catch (err) {
        // Summary might not exist for today
        setTodaySummary(null);
      }
    } catch (err) {
      logger.error('CLASSDETAILS', `Error loading attendance: ${String(err)}`);
    } finally {
      setAttendanceLoading(false);
    }
  };

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
          <p className="text-gray-600">Loading class details...</p>
        </div>
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="min-h-screen p-8 bg-secondary-50">
        <div className="max-w-6xl mx-auto">
          <Button variant="secondary" onClick={() => navigate('/classes')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Classes
          </Button>
          <div className="mt-8 p-8 bg-white rounded-lg shadow text-center">
            <p className="text-gray-600">Class not found</p>
          </div>
        </div>
      </div>
    );
  }

  const displayName = classData.name || classData.class_name || 'Class';
  const section = classData.section || '';
  const fullName = section ? `${displayName} — ${section}` : displayName;

  return (
    <div className="min-h-screen p-8 bg-secondary-50">
      <div className="max-w-6xl mx-auto">
        {/* Back Button */}
        <div className="mb-6">
          <Button variant="secondary" onClick={() => navigate('/classes')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Classes
          </Button>
        </div>

        {/* Class Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{fullName}</h1>
          <div className="flex flex-wrap gap-6 text-gray-600">
            {classData.capacity && (
              <div>
                <span className="font-semibold">Capacity:</span> {classData.capacity} students
              </div>
            )}
            {classData.assignments && classData.assignments.length > 0 && (
              <div>
                <span className="font-semibold">Subjects:</span> {classData.assignments.length}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg shadow-sm border-b mb-6">
          <div className="flex">
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-6 py-4 font-medium border-b-2 transition ${
                activeTab === 'attendance'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Attendance
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'attendance' && (
            <div>
              {attendanceLoading ? (
                <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading attendance data...</p>
                </div>
              ) : (
                <>
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
                      + Mark Today's Attendance
                    </Button>
                  </div>

                  {/* Previous Records */}
                  <div className="bg-white rounded-lg shadow-sm">
                    <div className="px-6 py-4 border-b">
                      <h2 className="text-xl font-semibold text-gray-900">Previous Records</h2>
                    </div>
                    
                    {dates.length === 0 ? (
                      <div className="px-6 py-8 text-center">
                        <p className="text-gray-600">No attendance records yet. Start by marking today's attendance.</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {dates.map((date, idx) => {
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
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassDetails;
