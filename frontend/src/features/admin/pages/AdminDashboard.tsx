import React, { useState, useEffect } from 'react';
import logger from '../../../utils/logger';

logger.fileLoaded('features/admin/pages/AdminDashboard.tsx');
import { motion } from 'framer-motion';
import { Users, Settings, Trash2, Plus } from 'lucide-react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import api from '../../../utils/api';

interface Role {
  _id: string;
  name: string;
  permissions: string[];
  description?: string;
  created_at: string;
}

interface User {
  _id: string;
  email: string;
  name?: string;
  role_name?: string;
  role?: {
    name: string;
  };
  is_active: boolean;
  created_at: string;
}

interface UserFormData {
  email: string;
  password: string;
  role: string;
  name: string;
}

interface RoleFormData {
  name: string;
  description: string;
  permissions: string[];
}

const AVAILABLE_PERMISSIONS = [
  'system.manage_access',
  'students.read',
  'students.write',
  'teachers.read',
  'teachers.write',
  'academics.assign_subjects',
  'academics.view_classes',
  'fees.manage',
  'fees.view',
  'accounting.dashboard_view',
  'inventory.manage',
  'inventory.view',
  'sales.manage',
  'reports.view',
];

const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [userFormData, setUserFormData] = useState<UserFormData>({ email: '', password: '', role: 'Teacher', name: '' });
  const [roleFormData, setRoleFormData] = useState<RoleFormData>({ name: '', description: '', permissions: [] });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Helper function to get role name from user object
  const getRoleName = (user: User) => {
    return user.role_name || user.role?.name || 'Unknown';
  };
  // Get current user role for filtering
  const getCurrentUserRole = () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      const user = JSON.parse(userStr);
      return typeof user.role === 'string' ? user.role : user.role?.name || '';
    } catch {
      return null;
    }
  };

  const currentUserRole = getCurrentUserRole();

  // Filter users based on current user's role
  const getFilteredUsers = () => {
    if (currentUserRole === 'Root') {
      return users; // Root can see all users
    } else if (currentUserRole === 'Admin') {
      return users.filter(user => getRoleName(user) !== 'Root'); // Admin cannot see Root users
    }
    return users; // Fallback
  };

  const filteredUsers = getFilteredUsers();

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else {
      fetchRoles();
    }
  }, [activeTab]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const fetchUsers = async () => {
    setLoading(true);
    // Clear error for user fetching - this is important data
    try {
      const data = await api.get('/api/admin/users');
      setUsers(data);
      setError(''); // Clear error on success
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      // Only show error if it's not a connection issue on first load
      if (users.length === 0) {
        logger.warn('ADMIN', `Failed to fetch users: ${errorMsg}`);
        // Don't set error on initial load - might be empty school
      } else {
        setError('Failed to fetch users: ' + errorMsg);
      }
      setUsers([]); // Set empty array to show error gracefully
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    setLoading(true);
    // Don't clear error here - roles endpoint now returns defaults gracefully
    try {
      const data = await api.get('/api/admin/roles');
      setRoles(data);
    } catch (err) {
      // Silently use empty roles - the backend should return defaults
      // Only log for debugging, don't show user-facing error for roles
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn('ADMIN', `Failed to fetch roles (using defaults): ${errorMsg}`);
      setRoles([]); // Empty array - UI will handle gracefully
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!userFormData.email || !userFormData.password || !userFormData.role) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');
    
    const payload = {
      email: userFormData.email,
      password: userFormData.password,
      role: userFormData.role,
      name: userFormData.name || userFormData.email.split('@')[0],
    };
    
    try {
      await api.post('/api/admin/users', payload);
      
      setSuccess('User created successfully! ✓');
      setShowUserModal(false);
      setUserFormData({ email: '', password: '', role: 'Teacher', name: '' });
      fetchUsers();
    } catch (err) {
      logger.error('ADMIN', `[ERROR] Exception creating user: ${String(err)}`);
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRole = async () => {
    if (!roleFormData.name || roleFormData.permissions.length === 0) {
      setError('Please fill in all fields and select at least one permission');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.post('/api/admin/roles', {
        name: roleFormData.name,
        description: roleFormData.description,
        permissions: roleFormData.permissions,
      });

      setSuccess('Role created successfully! ✓');
      setShowRoleModal(false);
      setRoleFormData({ name: '', description: '', permissions: [] });
      fetchRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (confirm(`Are you sure you want to delete ${userEmail}?`)) {
      try {
        await api.delete(`/api/admin/users/${userId}`);
        setSuccess('User deleted successfully! ✓');
        fetchUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete user');
      }
    }
  };

  const handleTogglePermission = (permission: string) => {
    if (roleFormData.permissions.includes(permission)) {
      setRoleFormData({
        ...roleFormData,
        permissions: roleFormData.permissions.filter(p => p !== permission),
      });
    } else {
      setRoleFormData({
        ...roleFormData,
        permissions: [...roleFormData.permissions, permission],
      });
    }
  };

  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-secondary-900 mb-2">Admin Dashboard</h1>
          <p className="text-secondary-600">Manage users, roles, and permissions</p>
        </motion.div>

        {/* Alerts */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg mb-6 flex justify-between items-center"
          >
            <div className="flex-1">
              <p className="font-semibold">Error loading data</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => activeTab === 'users' ? fetchUsers() : fetchRoles()}
                className="bg-danger-600 hover:bg-danger-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => setError('')}
                className="text-danger-500 hover:text-danger-700"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-lg mb-6 flex justify-between items-center"
          >
            <span>{success}</span>
            <button
              onClick={() => setSuccess('')}
              className="text-success-500 hover:text-success-700"
            >
              ✕
            </button>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              activeTab === 'users'
                ? 'bg-primary-600 text-white shadow-soft'
                : 'bg-white text-secondary-600 hover:bg-secondary-50 border border-secondary-200'
            }`}
          >
            <Users className="w-5 h-5" />
            Users Management
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              activeTab === 'roles'
                ? 'bg-primary-600 text-white shadow-soft'
                : 'bg-white text-secondary-600 hover:bg-secondary-50 border border-secondary-200'
            }`}
          >
            <Settings className="w-5 h-5" />
            Roles Management
          </button>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-soft p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-secondary-900">All Users</h2>
              <Button
                onClick={() => {
                  setUserFormData({ email: '', password: '', role: 'Teacher', name: '' });
                  setShowUserModal(true);
                }}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold"
              >
                <Plus className="w-5 h-5" />
                Add New User
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full"></div>
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-secondary-600">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-secondary-200">
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Email</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Name</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Role</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Status</th>
                      <th className="text-left py-4 px-4 font-bold text-secondary-900">Created</th>
                      <th className="text-right py-4 px-4 font-bold text-secondary-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <motion.tr
                        key={user._id}
                        whileHover={{ backgroundColor: '#f8fafc' }}
                        className="border-b border-secondary-100 transition-colors"
                      >
                        <td className="py-4 px-4 text-secondary-900 font-medium">{user.email}</td>
                        <td className="py-4 px-4 text-secondary-700">{user.name || '-'}</td>
                        <td className="py-4 px-4">
                          <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold">
                            {getRoleName(user)}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              user.is_active
                                ? 'bg-success-100 text-success-700'
                                : 'bg-warning-100 text-warning-700'
                            }`}
                          >
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-secondary-600 text-sm">
                          {new Date(user.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="py-4 px-4 text-right">
                          {getRoleName(user) !== 'Root' && (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleDeleteUser(user._id, user.email)}
                              className="p-2 text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                              title="Delete user"
                            >
                              <Trash2 className="w-5 h-5" />
                            </motion.button>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-soft p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-secondary-900">All Roles</h2>
              <Button
                onClick={() => {
                  setRoleFormData({ name: '', description: '', permissions: [] });
                  setShowRoleModal(true);
                }}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold"
              >
                <Plus className="w-5 h-5" />
                Add New Role
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full"></div>
                </div>
              </div>
            ) : roles.length === 0 ? (
              <div className="text-center py-12 text-secondary-600">
                <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No roles found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {roles.map((role) => (
                  <motion.div
                    key={role._id}
                    whileHover={{ y: -4 }}
                    className="border-2 border-secondary-200 rounded-lg p-6 hover:border-primary-300 hover:shadow-soft transition-all"
                  >
                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-secondary-900 mb-1">{role.name}</h3>
                      <p className="text-sm text-secondary-600">{role.description || 'No description'}</p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-bold text-secondary-700 mb-2">Permissions:</h4>
                        <div className="flex flex-wrap gap-2">
                          {role.permissions.length > 0 ? (
                            role.permissions.map((perm) => (
                              <span
                                key={perm}
                                className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs font-semibold"
                              >
                                {perm.replace(/_/g, ' ')}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-secondary-500">No permissions assigned</span>
                          )}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-secondary-200">
                        <p className="text-xs text-secondary-500">
                          Created: {new Date(role.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* User Modal */}
        <Modal
          isOpen={showUserModal}
          onClose={() => setShowUserModal(false)}
          title="Create New User"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-secondary-900 mb-2">Full Name</label>
              <input
                type="text"
                value={userFormData.name}
                onChange={(e) =>
                  setUserFormData({ ...userFormData, name: e.target.value })
                }
                placeholder="John Doe"
                className="w-full px-4 py-2 border-2 border-secondary-300 rounded-lg focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-secondary-900 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={userFormData.email}
                onChange={(e) =>
                  setUserFormData({ ...userFormData, email: e.target.value })
                }
                placeholder="user@school.edu"
                className="w-full px-4 py-2 border-2 border-secondary-300 rounded-lg focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-secondary-900 mb-2">
                Password
              </label>
              <input
                type="password"
                value={userFormData.password}
                onChange={(e) =>
                  setUserFormData({ ...userFormData, password: e.target.value })
                }
                placeholder="••••••••"
                className="w-full px-4 py-2 border-2 border-secondary-300 rounded-lg focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-secondary-900 mb-2">Role</label>
              <select
                value={userFormData.role}
                onChange={(e) =>
                  setUserFormData({ ...userFormData, role: e.target.value })
                }
                className="w-full px-4 py-2 border-2 border-secondary-300 rounded-lg focus:outline-none focus:border-primary-500 transition-colors"
              >
                {roles.map((role) => (
                  <option key={role._id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 mt-6 pt-4 border-t border-secondary-200">
              <Button
                onClick={handleAddUser}
                disabled={loading}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold"
              >
                {loading ? 'Creating...' : 'Create User'}
              </Button>
              <Button
                onClick={() => setShowUserModal(false)}
                className="flex-1 bg-secondary-200 hover:bg-secondary-300 text-secondary-900 font-semibold"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>

        {/* Role Modal */}
        <Modal
          isOpen={showRoleModal}
          onClose={() => setShowRoleModal(false)}
          title="Create New Role"
        >
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div>
              <label className="block text-sm font-bold text-secondary-900 mb-2">
                Role Name
              </label>
              <input
                type="text"
                value={roleFormData.name}
                onChange={(e) =>
                  setRoleFormData({ ...roleFormData, name: e.target.value })
                }
                placeholder="e.g., Librarian"
                className="w-full px-4 py-2 border-2 border-secondary-300 rounded-lg focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-secondary-900 mb-2">
                Description
              </label>
              <textarea
                value={roleFormData.description}
                onChange={(e) =>
                  setRoleFormData({ ...roleFormData, description: e.target.value })
                }
                placeholder="Brief description of this role..."
                rows={2}
                className="w-full px-4 py-2 border-2 border-secondary-300 rounded-lg focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-secondary-900 mb-3">
                Permissions (Select at least one)
              </label>
              <div className="grid grid-cols-2 gap-2 p-3 bg-secondary-50 rounded-lg">
                {AVAILABLE_PERMISSIONS.map((permission) => (
                  <label
                    key={permission}
                    className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={roleFormData.permissions.includes(permission)}
                      onChange={() => handleTogglePermission(permission)}
                      className="w-4 h-4 rounded border-2 border-primary-300 cursor-pointer"
                    />
                    <span className="text-xs text-secondary-700">
                      {permission.replace(/_/g, ' ')}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-secondary-600">
                Selected: {roleFormData.permissions.length} permission(s)
              </p>
            </div>
            <div className="flex gap-3 mt-6 pt-4 border-t border-secondary-200">
              <Button
                onClick={handleAddRole}
                disabled={loading}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold"
              >
                {loading ? 'Creating...' : 'Create Role'}
              </Button>
              <Button
                onClick={() => setShowRoleModal(false)}
                className="flex-1 bg-secondary-200 hover:bg-secondary-300 text-secondary-900 font-semibold"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default AdminDashboard;
