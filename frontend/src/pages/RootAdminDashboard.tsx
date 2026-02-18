import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Eye, EyeOff, AlertCircle, CheckCircle, Users } from 'lucide-react';
import { School, AdminUser } from '../types';
import { schoolsService } from '../services/schools';
import { rootAdminService } from '../services/rootAdmin';
import { authService } from '../services/auth';
import logger from '../utils/logger';

const RootAdminDashboard: React.FC = () => {
  const [schools, setSchools] = useState<School[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [activeTab, setActiveTab] = useState<'schools' | 'admins'>('schools');
  const [loading, setLoading] = useState(false);
  const [schoolFormOpen, setSchoolFormOpen] = useState(false);
  const [adminFormOpen, setAdminFormOpen] = useState(false);
  const [newSchool, setNewSchool] = useState({ displayName: '', email: '', phone: '' });
  const [newAdmin, setNewAdmin] = useState({ email: '', name: '', school_id: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const user = authService.getUser();

  // Load schools
  const loadSchools = async () => {
    setLoading(true);
    try {
      const response = await schoolsService.getAllSchools();
      setSchools(response.items || []);
      logger.info('ROOT', `[ROOT:${user?.email}] ✅ Loaded ${response.items?.length || 0} schools`);
      setMessage({ type: 'success', text: `Loaded ${response.items?.length || 0} schools` });
    } catch (error: any) {
      logger.error('ROOT', `[ROOT] ❌ Error loading schools: ${error.message}`);
      setMessage({ type: 'error', text: `Error loading schools: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Load admins
  const loadAdmins = async (schoolId?: string) => {
    setLoading(true);
    try {
      const data = schoolId ? 
        await rootAdminService.getSchoolAdmins(schoolId) :
        await rootAdminService.getAllAdmins();
      setAdmins(data);
      logger.info('ROOT', `[ROOT:${user?.email}] ✅ Loaded ${data.length} admins`);
      setMessage({ type: 'success', text: `Loaded ${data.length} admins` });
    } catch (error: any) {
      logger.error('ROOT', `[ROOT] ❌ Error loading admins: ${error.message}`);
      setMessage({ type: 'error', text: `Error loading admins: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Create school
  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await schoolsService.createSchool({
        displayName: newSchool.displayName,
        name: newSchool.displayName.toLowerCase(),
        email: newSchool.email,
        phone: newSchool.phone,
      });
      setNewSchool({ displayName: '', email: '', phone: '' });
      setSchoolFormOpen(false);
      loadSchools();
      setMessage({ type: 'success', text: `School "${newSchool.displayName}" created successfully` });
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error creating school: ${error.message}` });
    }
  };

  // Create admin
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdmin.school_id) {
      setMessage({ type: 'error', text: 'Please select a school' });
      return;
    }
    try {
      await rootAdminService.createAdmin(newAdmin);
      setNewAdmin({ email: '', name: '', school_id: '', password: '' });
      setAdminFormOpen(false);
      loadAdmins();
      setMessage({ type: 'success', text: `Admin "${newAdmin.email}" created successfully` });
    } catch (error: any) {
      setMessage({ type: 'error', text: `Error creating admin: ${error.message}` });
    }
  };

  // Delete admin
  const handleDeleteAdmin = async (adminId: string) => {
    if (window.confirm('Are you sure you want to delete this admin?')) {
      try {
        await rootAdminService.deleteAdmin(adminId);
        loadAdmins();
        setMessage({ type: 'success', text: 'Admin deleted successfully' });
      } catch (error: any) {
        setMessage({ type: 'error', text: `Error deleting admin: ${error.message}` });
      }
    }
  };

  // Delete school
  const handleDeleteSchool = async (schoolId: string) => {
    if (window.confirm('Are you sure you want to delete this school?')) {
      try {
        await schoolsService.deleteSchool(schoolId);
        loadSchools();
        setMessage({ type: 'success', text: 'School deleted successfully' });
      } catch (error: any) {
        setMessage({ type: 'error', text: `Error deleting school: ${error.message}` });
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'schools') {
      loadSchools();
    } else {
      loadAdmins();
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🎓 Root Admin Dashboard</h1>
          <p className="text-slate-400">Manage schools and admin users</p>
          {user && <p className="text-sm text-slate-400 mt-2">Logged in as: <span className="text-blue-400">{user.email}</span></p>}
        </div>

        {/* Messages */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center ${
            message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5 mr-3" /> : <AlertCircle className="w-5 h-5 mr-3" />}
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab('schools')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              activeTab === 'schools'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🏫 Schools ({schools.length})
          </button>
          <button
            onClick={() => setActiveTab('admins')}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              activeTab === 'admins'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            👥 Admins ({admins.length})
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center text-slate-300">Loading...</div>
        ) : activeTab === 'schools' ? (
          <div>
            <button
              onClick={() => setSchoolFormOpen(!schoolFormOpen)}
              className="mb-6 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> Create School
            </button>

            {schoolFormOpen && (
              <form onSubmit={handleCreateSchool} className="mb-6 p-4 bg-slate-700 rounded-lg">
                <input
                  type="text"
                  placeholder="School Name"
                  value={newSchool.displayName}
                  onChange={(e) => setNewSchool({ ...newSchool, displayName: e.target.value })}
                  className="w-full p-2 mb-3 bg-slate-600 text-white rounded border border-slate-500"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newSchool.email}
                  onChange={(e) => setNewSchool({ ...newSchool, email: e.target.value })}
                  className="w-full p-2 mb-3 bg-slate-600 text-white rounded border border-slate-500"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={newSchool.phone}
                  onChange={(e) => setNewSchool({ ...newSchool, phone: e.target.value })}
                  className="w-full p-2 mb-3 bg-slate-600 text-white rounded border border-slate-500"
                />
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchoolFormOpen(false)}
                    className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="grid gap-4">
              {schools.map((school) => (
                <div key={school.id} className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{school.displayName}</h3>
                      <p className="text-sm text-slate-400">{school.email || 'No email'}</p>
                      <p className="text-sm text-slate-400">{school.phone || 'No phone'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        title="View school"
                      >
                        <Users className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSchool(school.id)}
                        className="p-2 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setAdminFormOpen(!adminFormOpen)}
              className="mb-6 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> Create Admin
            </button>

            {adminFormOpen && (
              <form onSubmit={handleCreateAdmin} className="mb-6 p-4 bg-slate-700 rounded-lg">
                <select
                  value={newAdmin.school_id}
                  onChange={(e) => setNewAdmin({ ...newAdmin, school_id: e.target.value })}
                  className="w-full p-2 mb-3 bg-slate-600 text-white rounded border border-slate-500"
                  required
                >
                  <option value="">Select School</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.displayName}</option>
                  ))}
                </select>
                <input
                  type="email"
                  placeholder="Email"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  className="w-full p-2 mb-3 bg-slate-600 text-white rounded border border-slate-500"
                  required
                />
                <input
                  type="text"
                  placeholder="Name"
                  value={newAdmin.name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                  className="w-full p-2 mb-3 bg-slate-600 text-white rounded border border-slate-500"
                  required
                />
                <div className="relative mb-3">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={newAdmin.password}
                    onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                    className="w-full p-2 bg-slate-600 text-white rounded border border-slate-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminFormOpen(false)}
                    className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="grid gap-4">
              {admins.map((admin) => (
                <div key={admin.id} className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{admin.name}</h3>
                      <p className="text-sm text-slate-400">{admin.email}</p>
                      <p className="text-sm text-slate-400">
                        School: {schools.find(s => s.id === admin.school_id)?.displayName || 'Unknown'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteAdmin(admin.id)}
                      className="p-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RootAdminDashboard;
