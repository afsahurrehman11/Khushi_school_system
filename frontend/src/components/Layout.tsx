import React, { useState, useEffect } from 'react';
import logger from '../utils/logger';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings, Bell, Menu, GraduationCap, LogOut, DollarSign, TrendingUp, MessageSquare, ScanFace, Users, FileUp } from 'lucide-react';
import CashVerificationModal from '../features/accountant/components/CashVerificationModal';
import { cashSessionService, CashSession } from '../features/accountant/services/cashSessionService';

interface LayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [user, setUser] = useState<any>(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    } catch (err) {
      logger.warn('LAYOUT', 'Failed to parse stored user');
    }
  }, []);

  // Navigation items with explicit role-based visibility:
  // - Admin/Root: All items
  // - Accountant: All items EXCEPT Admin
  // - Teacher: Only Classes
  const navigation = [
    { name: 'Admin', href: '/dashboard/admin', icon: Settings, roles: ['Admin', 'Root'] },
    { name: 'Students', href: '/students', icon: Users, roles: ['Admin', 'Root', 'Accountant'] },
    { name: 'Import/Export', href: '/students/import-export', icon: FileUp, roles: ['Admin', 'Root', 'Accountant'] },
    { name: 'Teachers', href: '/teachers', icon: GraduationCap, roles: ['Admin', 'Root', 'Accountant'] },
    { name: 'Subjects', href: '/subjects', icon: GraduationCap, roles: ['Admin', 'Root', 'Accountant'] },
    { name: 'Classes', href: '/classes', icon: TrendingUp, roles: ['Admin', 'Root', 'Accountant', 'Teacher'] },
    { name: 'Fees', href: '/fees', icon: DollarSign, roles: ['Admin', 'Root', 'Accountant'] },
    { name: 'Accounting', href: '/dashboard/accountant', icon: TrendingUp, roles: ['Admin', 'Root', 'Accountant'] },
    { name: 'WhatsApp Bot', href: '/whatsapp-bot', icon: MessageSquare, roles: ['Admin', 'Root', 'Accountant'] },
    { name: 'Face App', href: '/face-app', icon: ScanFace, roles: ['Admin', 'Root', 'Accountant'] },
    { name: 'Settings', href: '/settings', icon: Settings, roles: ['Admin', 'Root', 'Accountant'] },
  ];

  const handleLogout = async () => {
    const userRole = user?.role && typeof user.role === 'object' ? user.role.name : user?.role;
    if (userRole === 'Accountant' || userRole === 'Admin') {
      // Load current session for cash verification
      setLoadingSession(true);
      try {
        const session = await cashSessionService.getCurrentSession();
        if (session && session.status === 'active') {
          setCurrentSession(session);
          setShowLogoutModal(true);
        } else {
          // No active session, proceed with logout
          onLogout();
          navigate('/login');
        }
      } catch (error) {
        logger.error('LAYOUT', `Failed to load session: ${String(error)}`);
        // Proceed with logout anyway
        onLogout();
        navigate('/login');
      } finally {
        setLoadingSession(false);
      }
    } else {
      onLogout();
      navigate('/login');
    }
  };

  const handleVerifiedLogout = () => {
    setShowLogoutModal(false);
    setCurrentSession(null);
    onLogout();
    navigate('/login');
  };

  const handleCancelLogout = () => {
    setShowLogoutModal(false);
    setCurrentSession(null);
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
              <h1 className="font-bold text-lg text-secondary-900">KHUSHI SMS</h1>
              <p className="text-xs text-secondary-500">School Management</p>
            </div>
          </div>
        </div>

        {/* Navigation (scrollable) */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto custom-scrollbar">
          {navigation.map((item) => {
            const Icon = item.icon;
            // Role-based visibility: check if user's role is in the item's roles array
            const userRole = typeof user?.role === 'object' ? user?.role?.name : user?.role;
            if (!userRole || !item.roles.includes(userRole)) {
              return null;
            }
            const active = isActive(item.href);
            return (
              <Link key={item.name} to={item.href}>
                <motion.div
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${active
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

        {/* User Info (fixed footer) */}
        <div className="p-4 border-t border-secondary-200 space-y-3 flex-shrink-0">
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
            disabled={loadingSession}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">{loadingSession ? 'Loading...' : 'Logout'}</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-secondary-200 flex items-center px-6 shadow-soft">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-lg hover:bg-secondary-100 transition-colors"
          >
            <Menu className="w-5 h-5 text-secondary-600" />
          </button>

          <div className="flex-1" />

          {/* Notifications only (right-most) */}
          <div className="flex items-center">
            <button className="relative p-2 rounded-lg hover:bg-secondary-100 transition-colors">
              <Bell className="w-5 h-5 text-secondary-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-danger-500 rounded-full"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </div>

      {/* Cash Verification Modal */}
      {showLogoutModal && currentSession && (
        <CashVerificationModal
          isOpen={showLogoutModal}
          onClose={handleCancelLogout}
          onVerified={handleVerifiedLogout}
          session={currentSession}
        />
      )}
    </div>
  );
};

export default Layout;
