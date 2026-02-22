import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Trash2, Eye, EyeOff, AlertCircle, CheckCircle, Users, 
  Building2, HardDrive, RefreshCw, Power, PowerOff,
  Search, Key, BarChart3, Database, Loader2, Receipt,
  LogOut
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
  onSuspend: (id: string) => void;
  onReactivate: (id: string) => void;
  onDelete: (id: string) => void;
  onResetPassword: (id: string) => void;
  onRefreshStats: (id: string) => void;
  loading: boolean;
}> = ({ schools, onSuspend, onReactivate, onDelete, onResetPassword, onRefreshStats, loading }) => {
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
                    <button
                      onClick={() => onRefreshStats(school.school_id)}
                      className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded"
                      title="Refresh Stats"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onResetPassword(school.school_id)}
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-700 rounded"
                      title="Reset Password"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    {school.status === 'active' ? (
                      <button
                        onClick={() => onSuspend(school.school_id)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-700 rounded"
                        title="Suspend School"
                      >
                        <PowerOff className="w-4 h-4" />
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
                    <button
                      onClick={() => onDelete(school.school_id)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded"
                      title="Delete School"
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">Create New School</h2>
        
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
            <label className="block text-sm font-medium text-slate-300 mb-1">Admin Email (Gmail) *</label>
            <input
              type="email"
              value={formData.admin_email}
              onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                         focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              placeholder="admin@school.com"
              required
            />
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

  // Create school handler
  const handleCreateSchool = async (data: SaaSSchoolCreate) => {
    setLoading(prev => ({ ...prev, action: true }));
    try {
      await saasService.createSchool(data);
      setMessage({ type: 'success', text: `School "${data.school_name}" created successfully!` });
      setCreateModalOpen(false);
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, action: false }));
    }
  };

  // Suspend school handler
  const handleSuspendSchool = async (schoolId: string) => {
    if (!window.confirm('Are you sure you want to suspend this school? Users will be blocked immediately.')) {
      return;
    }
    
    setLoading(prev => ({ ...prev, action: true }));
    try {
      await saasService.suspendSchool(schoolId);
      setMessage({ type: 'success', text: 'School suspended successfully' });
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

  // Delete school handler
  const handleDeleteSchool = async (schoolId: string) => {
    const hardDelete = window.confirm(
      'Do you want to permanently delete this school and its database?\n\n' +
      'Click OK for permanent deletion, or Cancel to soft-delete (keep data).'
    );
    
    if (!window.confirm('Are you sure you want to delete this school?')) {
      return;
    }
    
    setLoading(prev => ({ ...prev, action: true }));
    try {
      await saasService.deleteSchool(schoolId, hardDelete);
      setMessage({ type: 'success', text: 'School deleted successfully' });
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
            onSuspend={handleSuspendSchool}
            onReactivate={handleReactivateSchool}
            onDelete={handleDeleteSchool}
            onResetPassword={(id) => setResetPasswordModal({ open: true, schoolId: id })}
            onRefreshStats={handleRefreshStats}
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
      </div>
    </div>
  );
};

export default RootAdminDashboard;
