/**
 * Face App - Settings Page
 * Time configurations for students and employees
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  Settings,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Users,
  Briefcase,
  Gauge,
} from 'lucide-react';
import { getFaceSettings, updateFaceSettings } from '../services/faceApi';
import type { FaceSettings } from '../types';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';

const FaceSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<FaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await getFaceSettings();
      setSettings(data);
    } catch (err) {
      logger.error('FACE SETTINGS', `Failed to fetch settings: ${err}`);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setError('');
    setSaved(false);

    try {
      await updateFaceSettings(settings);
      setSaved(true);
      logger.info('FACE SETTINGS', 'Settings saved successfully');

      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      logger.error('FACE SETTINGS', `Failed to save settings: ${err}`);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTimeChange = (field: keyof FaceSettings, value: string) => {
    if (settings) {
      setSettings({ ...settings, [field]: value });
    }
  };

  const handleNumberChange = (field: keyof FaceSettings, value: number) => {
    if (settings) {
      setSettings({ ...settings, [field]: value });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-secondary-50 p-6">
        <div className="max-w-3xl mx-auto text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-secondary-900 mb-2">Could not load settings</h2>
          <p className="text-secondary-600 mb-4">{error}</p>
          <Button onClick={fetchSettings}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary-50 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/face-app"
            className="inline-flex items-center gap-2 text-secondary-600 hover:text-secondary-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-secondary-900">Face Recognition Settings</h1>
              <p className="text-secondary-500 text-sm mt-1">
                Configure time and recognition settings
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* Student Times */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-soft p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-secondary-900">Student Time Settings</h2>
                <p className="text-sm text-secondary-500">Define attendance time rules for students</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  School Start Time
                </label>
                <input
                  type="time"
                  value={settings.school_start_time}
                  onChange={(e) => handleTimeChange('school_start_time', e.target.value)}
                  className="w-full px-4 py-3 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-lg"
                />
                <p className="text-xs text-secondary-500 mt-1">When school officially starts</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Late After
                </label>
                <input
                  type="time"
                  value={settings.late_after_time}
                  onChange={(e) => handleTimeChange('late_after_time', e.target.value)}
                  className="w-full px-4 py-3 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-lg"
                />
                <p className="text-xs text-secondary-500 mt-1">Students marked late after this</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Auto Absent After
                </label>
                <input
                  type="time"
                  value={settings.auto_absent_time}
                  onChange={(e) => handleTimeChange('auto_absent_time', e.target.value)}
                  className="w-full px-4 py-3 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-lg"
                />
                <p className="text-xs text-secondary-500 mt-1">Automatically mark absent after</p>
              </div>
            </div>
          </motion.div>

          {/* Employee Times */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-soft p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold text-secondary-900">Employee Time Settings</h2>
                <p className="text-sm text-secondary-500">Define check-in/out time rules for employees</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Check-in Time
                </label>
                <input
                  type="time"
                  value={settings.employee_checkin_time}
                  onChange={(e) => handleTimeChange('employee_checkin_time', e.target.value)}
                  className="w-full px-4 py-3 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-lg"
                />
                <p className="text-xs text-secondary-500 mt-1">Expected check-in time</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Late After
                </label>
                <input
                  type="time"
                  value={settings.employee_late_after}
                  onChange={(e) => handleTimeChange('employee_late_after', e.target.value)}
                  className="w-full px-4 py-3 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-lg"
                />
                <p className="text-xs text-secondary-500 mt-1">Employees marked late after this</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Check-out Time
                </label>
                <input
                  type="time"
                  value={settings.employee_checkout_time}
                  onChange={(e) => handleTimeChange('employee_checkout_time', e.target.value)}
                  className="w-full px-4 py-3 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-lg"
                />
                <p className="text-xs text-secondary-500 mt-1">Expected check-out time</p>
              </div>
            </div>
          </motion.div>

          {/* Recognition Settings */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-soft p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold text-secondary-900">Recognition Settings</h2>
                <p className="text-sm text-secondary-500">Configure face recognition parameters</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  <Gauge className="w-4 h-4 inline mr-1" />
                  Confidence Threshold
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0.5"
                    max="0.99"
                    step="0.01"
                    value={settings.confidence_threshold}
                    onChange={(e) => handleNumberChange('confidence_threshold', parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-secondary-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-lg font-semibold text-secondary-900 w-16 text-right">
                    {Math.round(settings.confidence_threshold * 100)}%
                  </span>
                </div>
                <p className="text-xs text-secondary-500 mt-1">
                  Minimum confidence required for a match (recommended: 85%)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  Max Retry Attempts
                </label>
                <select
                  value={settings.max_retry_attempts}
                  onChange={(e) => handleNumberChange('max_retry_attempts', parseInt(e.target.value))}
                  className="w-full px-4 py-3 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option value={3}>3 attempts</option>
                  <option value={5}>5 attempts</option>
                  <option value={7}>7 attempts</option>
                  <option value={10}>10 attempts</option>
                </select>
                <p className="text-xs text-secondary-500 mt-1">
                  How many times to auto-retry on failure
                </p>
              </div>
            </div>
          </motion.div>

          {/* Info Card */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">About Time Settings</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>Students arriving before "Late After" time are marked as Present</li>
                <li>Students arriving after "Late After" but before "Auto Absent" are marked Late</li>
                <li>Students who don't arrive before "Auto Absent" time are marked Absent</li>
                <li>Employees have separate check-in and check-out tracking</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaceSettingsPage;
