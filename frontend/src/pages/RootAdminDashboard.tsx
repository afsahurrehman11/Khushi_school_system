import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Trash2, Eye, EyeOff, AlertCircle, CheckCircle, Users, 
  Building2, HardDrive, RefreshCw, Power, PowerOff, Pause,
  Search, Key, BarChart3, Database, Loader2, Receipt,
  LogOut, Calendar, DollarSign, AlertTriangle
} from 'lucide-react';
import { 
  SaaSSchool, SaaSSchoolCreate, SaaSOverviewStats, 
  SchoolStorageHistory, SchoolPlan, SchoolStatus 
} from '../types';
import { saasService } from '../services/saas';
import { authService } from '../services/auth';
import logger from '../utils/logger';

// ================= Loading Spinner Component =================
const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; text?: string }> = ({ 
  size = 'md', 
  text 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };
  
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-500`} />
      {text && <p className="text-slate-400 text-sm">{text}</p>}
    </div>
  );
};

// ================= Stats Card Component =================
const StatsCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}> = ({ title, value, icon, color, subtitle }) => (
  <div className={`bg-gradient-to-br ${color} rounded-xl p-5 shadow-lg transform transition hover:scale-105`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-white/80">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
        {subtitle && <p className="text-xs text-white/60 mt-1">{subtitle}</p>}
      </div>
      <div className="p-3 bg-white/20 rounded-lg">
        {icon}
      </div>
    </div>
  </div>
);

// ================= Storage Chart Component (Simple) =================
const StorageChart: React.FC<{ history: SchoolStorageHistory[] }> = ({ history }) => {
  if (!history || history.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Storage Usage Trends</h3>
        <p className="text-slate-400 text-center py-8">No storage history data available</p>
      </div>
    );
  }

  // Get max storage value for scaling
  const allValues = history.flatMap(h => h.history.map(d => d.storage_bytes));
  const maxValue = Math.max(...allValues, 1);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Colors for different schools
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  return (
    <div className="bg-slate-800/50 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Storage Usage Trends</h3>
      <div className="space-y-4">
        {history.slice(0, 5).map((school, idx) => {
          const latestStorage = school.history.length > 0 
            ? school.history[school.history.length - 1].storage_bytes 
            : 0;
          const percentage = (latestStorage / maxValue) * 100;
          
          return (
            <div key={school.school_id} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">{school.school_name}</span>
                <span className="text-slate-400">{formatBytes(latestStorage)}</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${Math.max(percentage, 2)}%`,
                    backgroundColor: colors[idx % colors.length]
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ================= School Table Component =================
const SchoolTable: React.FC<{
  schools: SaaSSchool[];
  onTemporarySuspend: (id: string) => void;
  onReactivate: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onResetPassword: (id: string) => void;
  onRefreshStats: (id: string) => void;
  onBillingDaySettings: (school: SaaSSchool) => void;
  loading: boolean;
}> = ({ schools, onTemporarySuspend, onReactivate, onPermanentDelete, onResetPassword, onRefreshStats, onBillingDaySettings, loading }) => {
  const [sortField] = useState<string>('created_at');
  const [sortDir] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: SchoolStatus) => {
    const styles = {
      active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      suspended: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      deleted: 'bg-red-500/20 text-red-400 border-red-500/30',
      pending: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getPlanBadge = (plan: SchoolPlan) => {
    const styles = {
      trial: 'bg-slate-500/20 text-slate-400',
      basic: 'bg-blue-500/20 text-blue-400',
      standard: 'bg-indigo-500/20 text-indigo-400',
      premium: 'bg-purple-500/20 text-purple-400',
      enterprise: 'bg-amber-500/20 text-amber-400',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[plan]}`}>
        {plan.charAt(0).toUpperCase() + plan.slice(1)}
      </span>
    );
  };

  // Filter and sort schools
  const filteredSchools = schools
    .filter(school => 
      school.school_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      school.admin_email.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortField as keyof SaaSSchool] as any;
      const bVal = b[sortField as keyof SaaSSchool] as any;
      if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-8">
        <LoadingSpinner size="lg" text="Loading schools..." />
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl overflow-hidden">
      {/* Search Bar */}
      <div className="p-4 border-b border-slate-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search schools..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                       focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                School
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Admin
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Plan
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Stats
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Created
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {filteredSchools.map((school) => (
              <tr key={school.id} className="hover:bg-slate-700/30 transition">
                <td className="px-4 py-4">
                  <div>
                    <p className="font-medium text-white">{school.school_name}</p>
                    <p className="text-xs text-slate-400">{school.database_name}</p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm text-slate-300">{school.admin_email}</p>
                </td>
                <td className="px-4 py-4">
                  {getStatusBadge(school.status)}
                </td>
                <td className="px-4 py-4">
                  {getPlanBadge(school.plan)}
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm">
                    <p className="text-slate-300">
                      <Users className="w-3 h-3 inline mr-1" />
                      {school.student_count} students
                    </p>
                    <p className="text-slate-400">
                      <HardDrive className="w-3 h-3 inline mr-1" />
                      {formatBytes(school.storage_bytes)}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-slate-400">
                  {formatDate(school.created_at)}
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    {/* Billing Day Setting */}
                    <button
                      onClick={() => onBillingDaySettings(school)}
                      className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 rounded"
                      title="Set Billing Day (Auto-Suspend)"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                    {/* Refresh Stats */}
                    <button
                      onClick={() => onRefreshStats(school.school_id)}
                      className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded"
                      title="Refresh Stats"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    {/* Reset Password */}
                    <button
                      onClick={() => onResetPassword(school.school_id)}
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-700 rounded"
                      title="Reset Admin Password"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    {/* Temporary Suspend / Reactivate */}
                    {school.status === 'active' ? (
                      <button
                        onClick={() => onTemporarySuspend(school.school_id)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-700 rounded"
                        title="Temporary Suspend (Block Logins)"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    ) : school.status === 'suspended' ? (
                      <button
                        onClick={() => onReactivate(school.school_id)}
                        className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 rounded"
                        title="Reactivate School"
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    ) : null}
                    {/* Permanent Delete */}
                    <button
                      onClick={() => onPermanentDelete(school.school_id)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded"
                      title="Permanent Delete (Irreversible)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredSchools.length === 0 && (
        <div className="p-8 text-center text-slate-400">
          No schools found matching your search.
        </div>
      )}
    </div>
  );
};

// ================= Create School Modal =================
const CreateSchoolModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SaaSSchoolCreate) => Promise<void>;
  loading: boolean;
}> = ({ isOpen, onClose, onSubmit, loading }) => {
  const [formData, setFormData] = useState<SaaSSchoolCreate>({
    school_name: '',
    admin_email: '',
    admin_password: '',
    admin_name: 'School Admin',
    plan: 'trial',
    phone: '',
    city: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [emailPrefix, setEmailPrefix] = useState('');
  const [emailError, setEmailError] = useState('');
  const [validationError, setValidationError] = useState('');

  // Email format: <school-name>@school
  const EMAIL_SUFFIX = '@school';

  const handleEmailPrefixChange = (value: string) => {
    // Check if user tried to enter @ symbol
    if (value.includes('@')) {
      setEmailError('The @ symbol is not allowed. Only enter the name part before @school');
      return;
    }
    setEmailError('');
    setValidationError(''); // Clear validation error when user starts typing
    setEmailPrefix(value.toLowerCase().trim());
    setFormData({ ...formData, admin_email: value.toLowerCase().trim() + EMAIL_SUFFIX });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailError) return;
    if (!emailPrefix) {
      setEmailError('Please enter the admin email prefix');
      return;
    }
    // Client-side validation: enforce minimum lengths matching backend
    if (!formData.school_name || formData.school_name.trim().length < 2) {
      setValidationError('School name must be at least 2 characters long');
      return;
    }
    if (!formData.admin_password || formData.admin_password.length < 6) {
      setValidationError('Admin password must be at least 6 characters long');
      return;
    }
    setValidationError(''); // Clear any previous validation error
    await onSubmit(formData);
    setFormData({
      school_name: '',
      admin_email: '',
      admin_password: '',
      admin_name: 'School Admin',
      plan: 'trial',
      phone: '',
      city: '',
    });
    setEmailPrefix('');
    setEmailError('');
    setValidationError('');
    setValidationError('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">Create New School</h2>
        
        {validationError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {validationError}
            </p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">School Name *</label>
            <input
              type="text"
              value={formData.school_name}
              onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                         focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              placeholder="Enter school name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Admin Email *</label>
            <div className="flex items-center">
              <input
                type="text"
                value={emailPrefix}
                onChange={(e) => handleEmailPrefixChange(e.target.value)}
                className={`flex-1 px-3 py-2 bg-slate-700 text-white rounded-l-lg border ${emailError ? 'border-red-500' : 'border-slate-600'}
                           focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none`}
                placeholder="schoolname"
                required
              />
              <span className="px-3 py-2 bg-slate-600 text-slate-300 rounded-r-lg border border-l-0 border-slate-600 font-mono text-sm">
                {EMAIL_SUFFIX}
              </span>
            </div>
            {emailError && (
              <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {emailError}
              </p>
            )}
            {emailPrefix && !emailError && (
              <p className="mt-1 text-sm text-emerald-400">
                Preview: <span className="font-mono">{emailPrefix}{EMAIL_SUFFIX}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Admin Password *</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.admin_password}
                onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
                className="w-full px-3 py-2 pr-10 bg-slate-700 text-white rounded-lg border border-slate-600 
                           focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                placeholder="Min 6 characters"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Plan</label>
            <select
              value={formData.plan}
              onChange={(e) => setFormData({ ...formData, plan: e.target.value as SchoolPlan })}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                         focus:border-blue-500 outline-none"
            >
              <option value="trial">Trial</option>
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                           focus:border-blue-500 outline-none"
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                           focus:border-blue-500 outline-none"
                placeholder="City"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                         disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create School
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ================= Reset Password Modal =================
const ResetPasswordModal: React.FC<{
  isOpen: boolean;
  schoolId: string;
  onClose: () => void;
  onSubmit: (schoolId: string, password: string) => Promise<void>;
  loading: boolean;
}> = ({ isOpen, schoolId, onClose, onSubmit, loading }) => {
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(schoolId, newPassword);
    setNewPassword('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">Reset Admin Password</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 bg-slate-700 text-white rounded-lg border border-slate-600 
                           focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                placeholder="Min 6 characters"
                minLength={6}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 
                         disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Key className="w-4 h-4" />
              )}
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ================= Payment Settings Modal =================
const PaymentSettingsModal: React.FC<{
  isOpen: boolean;
  school: SaaSSchool | null;
  onClose: () => void;
  onSave: (schoolId: string, settings: { payment_due_day?: number; auto_suspend_enabled?: boolean; grace_period_days?: number }) => Promise<void>;
  onRecordPayment: (schoolId: string, amount: number, notes?: string) => Promise<void>;
  loading: boolean;
}> = ({ isOpen, school, onClose, onSave, onRecordPayment, loading }) => {
  const [paymentDueDay, setPaymentDueDay] = useState<number>(1);
  const [autoSuspend, setAutoSuspend] = useState<boolean>(false);
  const [gracePeriod, setGracePeriod] = useState<number>(3);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'settings' | 'payment'>('payment');

  useEffect(() => {
    if (school) {
      setPaymentDueDay(school.payment_due_day || 1);
      setAutoSuspend(school.auto_suspend_enabled || false);
      setGracePeriod(school.grace_period_days || 3);
    }
  }, [school]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    await onSave(school.school_id, {
      payment_due_day: paymentDueDay,
      auto_suspend_enabled: autoSuspend,
      grace_period_days: gracePeriod,
    });
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school || !paymentAmount) return;
    await onRecordPayment(school.school_id, parseFloat(paymentAmount), paymentNotes);
    setPaymentAmount('');
    setPaymentNotes('');
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!isOpen || !school) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-500" />
          Payment Management
        </h2>
        <p className="text-slate-400 text-sm mb-4">{school.school_name}</p>

        {/* Current Status */}
        <div className="bg-slate-900/50 rounded-lg p-3 mb-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-500">Status:</span>
              <span className={`ml-2 ${school.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {school.status}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Next Due:</span>
              <span className="ml-2 text-white">{formatDate(school.next_payment_due)}</span>
            </div>
            <div>
              <span className="text-slate-500">Last Payment:</span>
              <span className="ml-2 text-white">{formatDate(school.last_payment_date)}</span>
            </div>
            <div>
              <span className="text-slate-500">Due Day:</span>
              <span className="ml-2 text-white">{school.payment_due_day || 'Not set'}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('payment')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'payment'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Record Payment
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Settings
          </button>
        </div>

        {activeTab === 'payment' ? (
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Payment Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                           focus:border-blue-500 outline-none"
                placeholder="Enter amount received"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Notes (optional)
              </label>
              <input
                type="text"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                           focus:border-blue-500 outline-none"
                placeholder="e.g., Bank transfer, Check #123"
              />
            </div>

            {school.status === 'suspended' && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                <p className="text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Recording payment will reactivate this school
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !paymentAmount}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 
                           disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                Record Payment
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Payment Due Day (1-28)
              </label>
              <select
                value={paymentDueDay}
                onChange={(e) => setPaymentDueDay(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                           focus:border-blue-500 outline-none"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of each month
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="autoSuspend"
                checked={autoSuspend}
                onChange={(e) => setAutoSuspend(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="autoSuspend" className="text-sm text-slate-300">
                Auto-suspend after grace period if unpaid
              </label>
            </div>

            {autoSuspend && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Grace Period (days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={gracePeriod}
                  onChange={(e) => setGracePeriod(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                             focus:border-blue-500 outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Days after due date before auto-suspension
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                           disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Save Settings
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ================= Billing Day Modal (Simple) =================
const BillingDayModal: React.FC<{
  isOpen: boolean;
  school: SaaSSchool | null;
  onClose: () => void;
  onSave: (schoolId: string, billingDay: number) => Promise<void>;
  loading: boolean;
}> = ({ isOpen, school, onClose, onSave, loading }) => {
  const [billingDay, setBillingDay] = useState<number>(4);

  useEffect(() => {
    if (school && school.payment_due_day) {
      setBillingDay(school.payment_due_day);
    }
  }, [school]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    await onSave(school.school_id, billingDay);
  };

  if (!isOpen || !school) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-500" />
          Set Billing Day
        </h2>
        <p className="text-slate-400 text-sm mb-4">{school.school_name}</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Monthly Billing Day
            </label>
            <select
              value={billingDay}
              onChange={(e) => setBillingDay(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                         focus:border-blue-500 outline-none"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of each month
                </option>
              ))}
            </select>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-blue-400 text-sm">
              If payment is not recorded by this day + grace period, the school will be automatically suspended.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                         disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Set Billing Day
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
// ================= Main Dashboard Component =================
const RootAdminDashboard: React.FC = () => {
  // State
  const [schools, setSchools] = useState<SaaSSchool[]>([]);
  const [stats, setStats] = useState<SaaSOverviewStats | null>(null);
  const [storageHistory, setStorageHistory] = useState<SchoolStorageHistory[]>([]);
  const [loading, setLoading] = useState({
    schools: false,
    stats: false,
    storage: false,
    action: false,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [resetPasswordModal, setResetPasswordModal] = useState<{ open: boolean; schoolId: string }>({
    open: false,
    schoolId: '',
  });
  const [paymentSettingsModal, setPaymentSettingsModal] = useState<{ open: boolean; school: SaaSSchool | null }>({
    open: false,
    school: null,
  });
  // New modals for clean action flow
  const [suspendModal, setSuspendModal] = useState<{ open: boolean; schoolId: string; schoolName: string }>({
    open: false,
    schoolId: '',
    schoolName: '',
  });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; schoolId: string; schoolName: string }>({
    open: false,
    schoolId: '',
    schoolName: '',
  });
  const [billingDayModal, setBillingDayModal] = useState<{ open: boolean; school: SaaSSchool | null }>({
    open: false,
    school: null,
  });

  const user = authService.getUser();

  // Helper to format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(prev => ({ ...prev, schools: true, stats: true, storage: true }));
    
    try {
      // Load in parallel
      const [schoolsRes, statsRes, storageRes] = await Promise.allSettled([
        saasService.getSchools({ limit: 100 }),
        saasService.getOverviewStats(),
        saasService.getStorageHistory(undefined, 30),
      ]);

      if (schoolsRes.status === 'fulfilled') {
        setSchools(schoolsRes.value.items);
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value);
      }
      if (storageRes.status === 'fulfilled') {
        setStorageHistory(storageRes.value);
      }

      logger.info('ROOT', 'Dashboard data loaded');
    } catch (error: any) {
      logger.error('ROOT', `Error loading data: ${error.message}`);
      setMessage({ type: 'error', text: `Error loading data: ${error.message}` });
    } finally {
      setLoading(prev => ({ ...prev, schools: false, stats: false, storage: false }));
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // State for admin credentials display after school creation
  const [adminCredentials, setAdminCredentials] = useState<{
    open: boolean;
    schoolName: string;
    email: string;
    password: string;
  }>({ open: false, schoolName: '', email: '', password: '' });

  // Create school handler
  const handleCreateSchool = async (data: SaaSSchoolCreate) => {
    setLoading(prev => ({ ...prev, action: true }));
    try {
      const result = await saasService.createSchool(data);
      setCreateModalOpen(false);
      await loadData();
      
      // Show admin credentials modal after successful creation
      if (result.admin_auth?.user) {
        setAdminCredentials({
          open: true,
          schoolName: result.school.school_name,
          email: result.admin_auth.user.email,
          password: result.admin_password || 'See email or contact root admin'
        });
      } else {
        setMessage({ type: 'success', text: `School "${data.school_name}" created successfully!` });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  // Temporary Suspend school handler - simple confirmation
  const handleTemporarySuspend = async (schoolId: string) => {
    const school = schools.find(s => s.school_id === schoolId);
    setSuspendModal({
      open: true,
      schoolId,
      schoolName: school?.school_name || '',
    });
  };

  // Confirm temporary suspension
  const confirmTemporarySuspend = async () => {
    setLoading(prev => ({ ...prev, action: true }));
    try {
      await saasService.temporarySuspendSchool(suspendModal.schoolId);
      setMessage({ type: 'success', text: 'School temporarily suspended. All logins blocked.' });
      setSuspendModal({ open: false, schoolId: '', schoolName: '' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  // Reactivate school handler
  const handleReactivateSchool = async (schoolId: string) => {
    setLoading(prev => ({ ...prev, action: true }));
    try {
      await saasService.reactivateSchool(schoolId);
      setMessage({ type: 'success', text: 'School reactivated successfully' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  // Permanent Delete school handler - simple confirmation
  const handlePermanentDelete = async (schoolId: string) => {
    const school = schools.find(s => s.school_id === schoolId);
    setDeleteModal({
      open: true,
      schoolId,
      schoolName: school?.school_name || '',
    });
  };

  // Confirm permanent deletion
  const confirmPermanentDelete = async () => {
    setLoading(prev => ({ ...prev, action: true }));
    try {
      await saasService.permanentDeleteSchool(deleteModal.schoolId);
      setMessage({ type: 'success', text: 'School permanently deleted along with all its data.' });
      setDeleteModal({ open: false, schoolId: '', schoolName: '' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  // Billing Day Settings handler
  const handleBillingDaySettings = (school: SaaSSchool) => {
    setBillingDayModal({ open: true, school });
  };

  // Save billing day
  const handleSaveBillingDay = async (schoolId: string, billingDay: number) => {
    setLoading(prev => ({ ...prev, action: true }));
    try {
      await saasService.setBillingDay(schoolId, billingDay);
      setMessage({ type: 'success', text: `Billing day set to ${billingDay}. Auto-suspension enabled.` });
      setBillingDayModal({ open: false, school: null });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  // Reset password handler
  const handleResetPassword = async (schoolId: string, newPassword: string) => {
    setLoading(prev => ({ ...prev, action: true }));
    try {
      await saasService.resetAdminPassword(schoolId, newPassword);
      setMessage({ type: 'success', text: 'Password reset successfully' });
      setResetPasswordModal({ open: false, schoolId: '' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  // Refresh stats handler
  const handleRefreshStats = async (schoolId: string) => {
    try {
      await saasService.refreshSchoolStats(schoolId);
      setMessage({ type: 'success', text: 'Stats refreshed' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  // Payment settings handler
  const handleSavePaymentSettings = async (schoolId: string, settings: {
    payment_due_day?: number;
    auto_suspend_enabled?: boolean;
    grace_period_days?: number;
  }) => {
    setLoading(prev => ({ ...prev, action: true }));
    try {
      await saasService.updatePaymentSettings(schoolId, settings);
      setMessage({ type: 'success', text: 'Payment settings updated!' });
      setPaymentSettingsModal({ open: false, school: null });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  // Record payment handler
  const handleRecordPayment = async (schoolId: string, amount: number, notes?: string) => {
    setLoading(prev => ({ ...prev, action: true }));
    try {
      await saasService.recordPayment(schoolId, { amount, notes });
      setMessage({ type: 'success', text: 'Payment recorded! School reactivated if suspended.' });
      setPaymentSettingsModal({ open: false, school: null });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Database className="w-8 h-8 text-blue-500" />
                SaaS Admin Dashboard
              </h1>
              <p className="text-slate-400 mt-1">
                Manage schools, view analytics, and monitor system health
              </p>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="#/billing"
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <Receipt className="w-4 h-4" />
                Billing & Invoices
              </a>
              <div className="text-right">
                <p className="text-sm text-slate-400">Logged in as</p>
                <p className="text-blue-400 font-medium">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  authService.logout();
                  window.location.href = '#/login';
                }}
                className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors text-sm"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 animate-fade-in ${
            message.type === 'success' 
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            {message.text}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {loading.stats ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-slate-800/50 rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-1/2 mb-2" />
                <div className="h-8 bg-slate-700 rounded w-3/4" />
              </div>
            ))
          ) : (
            <>
              <StatsCard
                title="Total Schools"
                value={stats?.total_schools || 0}
                subtitle={`${stats?.active_schools || 0} active, ${stats?.suspended_schools || 0} suspended`}
                icon={<Building2 className="w-6 h-6 text-white" />}
                color="from-blue-600 to-blue-800"
              />
              <StatsCard
                title="Total Students"
                value={stats?.total_students?.toLocaleString() || 0}
                subtitle="Across all schools"
                icon={<Users className="w-6 h-6 text-white" />}
                color="from-emerald-600 to-emerald-800"
              />
              <StatsCard
                title="Total Teachers"
                value={stats?.total_teachers?.toLocaleString() || 0}
                subtitle="Across all schools"
                icon={<Users className="w-6 h-6 text-white" />}
                color="from-purple-600 to-purple-800"
              />
              <StatsCard
                title="Total Storage"
                value={formatBytes(stats?.total_storage_bytes || 0)}
                subtitle="Database storage used"
                icon={<HardDrive className="w-6 h-6 text-white" />}
                color="from-amber-600 to-amber-800"
              />
            </>
          )}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Plan Distribution */}
          <div className="bg-slate-800/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              Plan Distribution
            </h3>
            {loading.stats ? (
              <LoadingSpinner text="Loading..." />
            ) : (
              <div className="space-y-3">
                {[
                  { name: 'Trial', count: stats?.trial_schools || 0, color: 'bg-slate-500' },
                  { name: 'Basic', count: stats?.basic_schools || 0, color: 'bg-blue-500' },
                  { name: 'Standard', count: stats?.standard_schools || 0, color: 'bg-indigo-500' },
                  { name: 'Premium', count: stats?.premium_schools || 0, color: 'bg-purple-500' },
                  { name: 'Enterprise', count: stats?.enterprise_schools || 0, color: 'bg-amber-500' },
                ].map((plan) => (
                  <div key={plan.name} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${plan.color}`} />
                    <span className="text-slate-300 w-24">{plan.name}</span>
                    <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${plan.color} rounded-full transition-all duration-500`}
                        style={{ 
                          width: `${stats?.total_schools ? (plan.count / stats.total_schools) * 100 : 0}%` 
                        }}
                      />
                    </div>
                    <span className="text-slate-400 text-sm w-8 text-right">{plan.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Storage Chart */}
          {loading.storage ? (
            <div className="bg-slate-800/50 rounded-xl p-6">
              <LoadingSpinner text="Loading storage data..." />
            </div>
          ) : (
            <StorageChart history={storageHistory} />
          )}
        </div>

        {/* Schools Table Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-500" />
              Schools ({schools.length})
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => loadData()}
                className="px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 
                           transition flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                           transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create School
              </button>
            </div>
          </div>

          <SchoolTable
            schools={schools}
            loading={loading.schools}
            onTemporarySuspend={handleTemporarySuspend}
            onReactivate={handleReactivateSchool}
            onPermanentDelete={handlePermanentDelete}
            onResetPassword={(id) => setResetPasswordModal({ open: true, schoolId: id })}
            onRefreshStats={handleRefreshStats}
            onBillingDaySettings={handleBillingDaySettings}
          />
        </div>

        {/* Modals */}
        <CreateSchoolModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={handleCreateSchool}
          loading={loading.action}
        />

        <ResetPasswordModal
          isOpen={resetPasswordModal.open}
          schoolId={resetPasswordModal.schoolId}
          onClose={() => setResetPasswordModal({ open: false, schoolId: '' })}
          onSubmit={handleResetPassword}
          loading={loading.action}
        />

        <PaymentSettingsModal
          isOpen={paymentSettingsModal.open}
          school={paymentSettingsModal.school}
          onClose={() => setPaymentSettingsModal({ open: false, school: null })}
          onSave={handleSavePaymentSettings}
          onRecordPayment={handleRecordPayment}
          loading={loading.action}
        />

        {/* Temporary Suspend Confirmation Modal */}
        {suspendModal.open && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-slate-700">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Pause className="w-6 h-6 text-amber-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Temporary Suspend</h2>
              </div>
              
              <p className="text-slate-300 mb-4">
                Are you sure you want to temporarily suspend <strong className="text-white">{suspendModal.schoolName}</strong>?
              </p>
              
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                <p className="text-amber-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  This will block ALL logins for this school (admin and staff).
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setSuspendModal({ open: false, schoolId: '', schoolName: '' })}
                  className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmTemporarySuspend}
                  disabled={loading.action}
                  className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading.action ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                  Suspend School
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Permanent Delete Confirmation Modal */}
        {deleteModal.open && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-red-500/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Permanent Delete</h2>
              </div>
              
              <p className="text-slate-300 mb-4">
                This will <strong className="text-red-400">permanently delete</strong> the school <strong className="text-white">{deleteModal.schoolName}</strong> and ALL its data.
              </p>
              
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 space-y-2">
                <p className="text-red-400 text-sm font-semibold">This action will delete:</p>
                <ul className="text-red-300 text-sm list-disc list-inside space-y-1">
                  <li>The entire school database</li>
                  <li>All admin and staff accounts</li>
                  <li>All payment records</li>
                  <li>All usage snapshots</li>
                  <li>All invoices</li>
                </ul>
                <p className="text-red-400 text-sm font-bold mt-2">⚠️ This cannot be undone!</p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteModal({ open: false, schoolId: '', schoolName: '' })}
                  className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPermanentDelete}
                  disabled={loading.action}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading.action ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete Permanently
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Billing Day Modal */}
        {billingDayModal.open && billingDayModal.school && (
          <BillingDayModal
            isOpen={billingDayModal.open}
            school={billingDayModal.school}
            onClose={() => setBillingDayModal({ open: false, school: null })}
            onSave={handleSaveBillingDay}
            loading={loading.action}
          />
        )}

        {/* Admin Credentials Modal - Shown after school creation */}
        {adminCredentials.open && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-slate-700">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-white">School Created Successfully!</h2>
              </div>
              
              <div className="bg-slate-900/50 rounded-lg p-4 mb-4 space-y-3">
                <p className="text-slate-300">
                  <strong>School:</strong> {adminCredentials.schoolName}
                </p>
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-sm text-slate-400 mb-2">Admin Login Credentials:</p>
                  <p className="text-slate-300">
                    <strong>Email:</strong> {adminCredentials.email}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-slate-300">
                      <strong>Password:</strong> 
                      <code className="ml-2 px-2 py-1 bg-slate-800 rounded text-emerald-400 font-mono">
                        {adminCredentials.password}
                      </code>
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                <p className="text-amber-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Please save these credentials! The password cannot be recovered later.
                </p>
              </div>
              
              <button
                onClick={() => setAdminCredentials({ open: false, schoolName: '', email: '', password: '' })}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                I've Saved the Credentials
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RootAdminDashboard;
