/**
 * Face Recognition Dashboard
 * Formal, soft-colored admin interface
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  UserCheck,
  Clock,
  RefreshCw,
  Loader2,
  ChevronRight,
  Briefcase,
} from 'lucide-react';
import {
  getDashboardStats,
  getTodayActivity,
  getFaceStatus,
  loadEmbeddingsCache,
} from '../services/faceApi';
import type { DashboardStats, FaceActivity, FaceStatus, ClassStats } from '../types';
import logger from '../../../utils/logger';

const FaceDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<FaceActivity[]>([]);
  const [status, setStatus] = useState<FaceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cacheLoading, setCacheLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsData, activityData, statusData] = await Promise.all([
        getDashboardStats(),
        getTodayActivity(50),
        getFaceStatus(),
      ]);
      setStats(statsData);
      setActivities(activityData.activities || []);
      setStatus(statusData);
      logger.info('FACE UI', 'Dashboard data loaded');
    } catch (err) {
      logger.error('FACE UI', `Failed to load dashboard: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadCache = async () => {
    setCacheLoading(true);
    try {
      const result = await loadEmbeddingsCache();
      logger.info('FACE UI', `Cache loaded: ${result.loaded.students} students, ${result.loaded.employees} employees`);
      await fetchData();
    } catch (err) {
      logger.error('FACE UI', `Cache load failed: ${err}`);
    } finally {
      setCacheLoading(false);
    }
  };

  const getStatusColor = (action: string) => {
    switch (action) {
      case 'present':
      case 'check_in':
        return 'text-green-600';
      case 'late':
        return 'text-yellow-600';
      case 'check_out':
        return 'text-blue-600';
      default:
        return 'text-secondary-600';
    }
  };

  const getStatusLabel = (action: string) => {
    switch (action) {
      case 'present':
        return 'Present';
      case 'late':
        return 'Late';
      case 'check_in':
        return 'Check-in';
      case 'check_out':
        return 'Check-out';
      default:
        return action;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-secondary-900">Face Recognition</h1>
              <p className="text-secondary-500 text-sm mt-1">
                Manage face registration and attendance
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Status indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-secondary-200">
                {status?.ready ? (
                  <>
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-sm text-green-600">System Ready</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                    <span className="text-sm text-yellow-600">Loading...</span>
                  </>
                )}
              </div>
              <button
                onClick={handleLoadCache}
                disabled={cacheLoading}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-secondary-200 hover:bg-secondary-50 transition-colors text-sm text-secondary-700"
              >
                <RefreshCw className={`w-4 h-4 ${cacheLoading ? 'animate-spin' : ''}`} />
                Refresh Cache
              </button>
              <Link
                to="/face-app/recognition"
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                Start Recognition
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Classes Grid */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-secondary-900">Classes</h2>
                <Link
                  to="/face-app/students"
                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  View All <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats?.classes.map((cls: ClassStats) => (
                  <ClassCard key={`${cls.class_id}-${cls.section}`} classData={cls} />
                ))}
                {(!stats?.classes || stats.classes.length === 0) && (
                  <p className="text-secondary-500 col-span-full text-center py-8">
                    No classes found
                  </p>
                )}
              </div>
            </div>

            {/* Employees Card */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-secondary-900">Employees</h2>
                <Link
                  to="/face-app/employees"
                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  Manage <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="flex items-center gap-6 p-4 bg-secondary-50 rounded-lg">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-secondary-900">
                      {stats?.employees?.total || 0}
                    </p>
                    <p className="text-xs text-secondary-500">Total</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {stats?.employees?.face_ready || 0}
                    </p>
                    <p className="text-xs text-secondary-500">Face Ready</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-yellow-600">
                      {stats?.employees?.pending || 0}
                    </p>
                    <p className="text-xs text-secondary-500">Pending</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - 1/3 */}
          <div className="space-y-6">
            {/* Today's Activity */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <h2 className="text-lg font-semibold text-secondary-900 mb-4">Today's Activity</h2>

              <div className="max-h-[500px] overflow-y-auto space-y-2">
                {activities.length === 0 ? (
                  <p className="text-secondary-500 text-sm text-center py-8">
                    No activity today
                  </p>
                ) : (
                  activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-secondary-50 transition-colors"
                    >
                      <span className="text-xs text-secondary-400 font-mono w-12">
                        [{activity.time}]
                      </span>
                      <span className="flex-1 text-sm text-secondary-700 truncate">
                        {activity.person_name}
                      </span>
                      <span className={`text-xs font-medium ${getStatusColor(activity.action)}`}>
                        {getStatusLabel(activity.action)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <h3 className="text-sm font-medium text-secondary-700 mb-3">System Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-secondary-500">FaceNet Model</span>
                  <span className={status?.facenet_available ? 'text-green-600' : 'text-yellow-600'}>
                    {status?.facenet_available ? 'Active' : 'Fallback'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-500">Device</span>
                  <span className="text-secondary-700">{status?.device || 'CPU'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-500">Cached Students</span>
                  <span className="text-secondary-700">{status?.cached_students || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-500">Cached Employees</span>
                  <span className="text-secondary-700">{status?.cached_employees || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Class Card Component
const ClassCard: React.FC<{ classData: ClassStats }> = ({ classData }) => {
  const readyPercent =
    classData.total > 0 ? Math.round((classData.face_ready / classData.total) * 100) : 0;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="p-4 bg-secondary-50 rounded-lg border border-secondary-100 hover:border-primary-200 transition-all cursor-pointer"
    >
      <Link to={`/face-app/students?class=${classData.class_id}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-secondary-900">
            {classData.class_id} - {classData.section}
          </span>
          <span className="text-xs text-secondary-500">{classData.total} students</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-600">{classData.face_ready}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-yellow-500" />
            <span className="text-sm text-yellow-600">{classData.pending}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-secondary-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${readyPercent}%` }}
          />
        </div>
        <p className="text-xs text-secondary-500 mt-1">{readyPercent}% ready</p>
      </Link>
    </motion.div>
  );
};

export default FaceDashboard;
