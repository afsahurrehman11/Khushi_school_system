import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Settings, Bell, Menu, GraduationCap, LogOut, DollarSign, TrendingUp, Filter, FileSpreadsheet } from 'lucide-react';
import AccountantLogoutSummary from '../features/accountant/components/AccountantLogoutSummary';

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

interface User {
  id: string;
  email: string;
  role: { name: string; permissions: string[] } | string;
}

const Layout: React.FC<LayoutProps> = ({ children, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[LAYOUT] Current route:', location.pathname);
  }, [location]);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [showLogoutSummary, setShowLogoutSummary] = useState(false);

  useEffect(() => {
    const userJson = localStorage.getItem('user');
    
    if (userJson) {
      try {
        const parsed = JSON.parse(userJson);
        
        // Normalize role shape: backend may return role as a string or an object
        if (parsed.role && typeof parsed.role === 'string') {
          parsed.role = { name: parsed.role, permissions: [] };
        }
        setUser(parsed);
      } catch (err) {
        setUser(null);
      }
    }
  }, []);

  const navigation = [
    { name: 'Students', href: '/students', icon: Users, permission: 'students.read' },
    { name: 'Import / Export', href: '/students/import-export', icon: FileSpreadsheet, permission: 'students.read' },
    { name: 'Admin', href: '/dashboard/admin', icon: Settings, roles: ['Admin', 'Root'] },
    { name: 'Teachers', href: '/teachers', icon: GraduationCap, permission: 'teachers.read' },
    { name: 'Subjects', href: '/subjects', icon: GraduationCap, permission: 'subjects.read' },
    { name: 'Classes', href: '/classes', icon: TrendingUp, permission: 'classes.read' },
    { name: 'Fees', href: '/fees', icon: DollarSign, permission: 'fees.view' },
    { name: 'Accounting', href: '/dashboard/accountant', icon: TrendingUp, permission: 'accounting.dashboard_view' },
    { name: 'Reports', href: '/reports', icon: Filter, permission: 'reports.view' },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const handleLogout = () => {
    const userRole = user?.role && typeof user.role === 'object' ? user.role.name : user?.role;
    if (userRole === 'Accountant') {
      setShowLogoutSummary(true);
    } else {
      onLogout();
      navigate('/login');
    }
  };

  const handleVerifyLogout = () => {
    setShowLogoutSummary(false);
    onLogout();
    navigate('/login');
  };

  const handleCancelLogout = () => {
    setShowLogoutSummary(false);
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="flex h-screen bg-secondary-50">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: 0 }}
        animate={{ x: isSidebarOpen ? 0 : -280 }}
        transition={{ type: 'spring', damping: 20 }}
        className="w-64 bg-white border-r border-secondary-200 flex flex-col fixed h-full z-30 shadow-soft"
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-secondary-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">K</span>
            </div>
            <div>
              <h1 className="font-bold text-lg text-secondary-900">Kushi ERP</h1>
              <p className="text-xs text-secondary-500">School Management</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            // permission guard: if item.roles is defined, check role membership
            if (item.roles) {
              const userRole = typeof user?.role === 'object' ? user?.role?.name : user?.role;
              if (!userRole || !item.roles.includes(userRole)) {
                return null;
              }
            }
            // permission guard: if item.permission is defined, ensure user has it
            else if (item.permission) {
                const hasPerm = !!(
                  (typeof user?.role === 'object' && user.role.permissions?.includes(item.permission)) ||
                  // support legacy role string (e.g., 'Admin') by granting admin access
                  (typeof user?.role === 'object' && user.role.name?.toLowerCase() === 'admin') ||
                  (typeof user?.role === 'string' && user.role.toLowerCase() === 'admin')
                );
              if (!hasPerm) return null;
            }
            const active = isActive(item.href);
            return (
              <Link key={item.name} to={item.href}>
                <motion.div
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    active
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-secondary-600 hover:bg-secondary-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-secondary-200 space-y-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary-50">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-700 font-semibold">
                  {user?.email?.charAt(0)?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-secondary-900">{(user?.role && (user.role as any).name) || (typeof user?.role === 'string' ? user.role : 'User')}</p>
                <p className="text-xs text-secondary-500">{user?.email}</p>
              </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-danger-600 hover:bg-danger-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-secondary-200 flex items-center justify-between px-6 shadow-soft">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-lg hover:bg-secondary-100 transition-colors"
          >
            <Menu className="w-5 h-5 text-secondary-600" />
          </button>

          <div className="flex items-center gap-4">
            {/* Notifications */}
            <button className="relative p-2 rounded-lg hover:bg-secondary-100 transition-colors">
              <Bell className="w-5 h-5 text-secondary-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-danger-500 rounded-full"></span>
            </button>

            {/* Current Date */}
            <div className="text-sm text-secondary-600">
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </div>

      {showLogoutSummary && (
        <AccountantLogoutSummary
          onVerify={handleVerifyLogout}
          onCancel={handleCancelLogout}
        />
      )}
    </div>
  );
};

export default Layout;
