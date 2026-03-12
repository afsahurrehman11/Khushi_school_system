import React, { useState, useEffect } from 'react';
import logger from '../utils/logger';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings, Bell, Menu, GraduationCap, LogOut, DollarSign, TrendingUp, MessageSquare, ScanFace, Users, FileUp, BookOpen, BarChart3, FileText } from 'lucide-react';
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
    { name: 'Subjects', href: '/subjects', icon: BookOpen, roles: ['Admin', 'Root', 'Accountant'] },
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

  // Accent colors for nav items (soft tones)
  const accents: Record<string, string> = {
    Admin: '#1F2937',        // slate-800
    Students: '#2563EB',     // blue-600
    'Import/Export': '#DB2777', // fuchsia-600
    Teachers: '#7C3AED',     // violet-600
    Subjects: '#059669',     // green-600
    Classes: '#D97706',      // amber-600
    Fees: '#DC2626',         // red-600
    Accounting: '#0D9488',   // teal-600
    'WhatsApp Bot': '#10B981',// emerald-500
    'Face App': '#06B6D4',   // cyan-500
    Settings: '#4F46E5',     // indigo-600
  };

  const hexToRgba = (hex: string, alpha = 1) => {
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <div className="flex h-screen bg-secondary-50">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: 0 }}
        animate={{ x: isSidebarOpen ? 0 : -280 }}
        transition={{ type: 'spring', damping: 20 }}
        className="w-56 bg-white border-r border-secondary-200 flex flex-col fixed h-full z-30 shadow-soft"
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-secondary-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">K</span>
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base text-secondary-900 truncate">KHUSHI SMS</h1>
              <p className="text-xs text-secondary-500 truncate">School Management</p>
            </div>
          </div>
        </div>

        {/* Navigation (scrollable) */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
          {navigation.map((item) => {
            const Icon = item.icon;
            // Role-based visibility: check if user's role is in the item's roles array
            const userRole = typeof user?.role === 'object' ? user?.role?.name : user?.role;
            if (!userRole || !item.roles.includes(userRole)) return null;
            const active = isActive(item.href);
            const accent = accents[item.name] || '#60A5FA';
            
            const handleNavClick = () => {
              // Navigation logging can be added here if needed
            };
            
            return (
              <Link key={item.name} to={item.href} onClick={handleNavClick}>
                <motion.div
                  transition={{ duration: 0.12 }}
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.97 }}
                  animate={{
                    backgroundColor: active ? hexToRgba(accent, 0.14) : 'rgba(0,0,0,0)',
                    color: active ? accent : undefined,
                    boxShadow: active ? `inset 4px 0 0 0 ${hexToRgba(accent, 0.24)}` : 'inset 4px 0 0 0 rgba(0,0,0,0)'
                  }}
                  style={{ borderRadius: 10 }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-120 ease-out text-base ${active ? 'font-medium' : 'text-secondary-700'}`}>
                  <Icon className="w-4 h-4" strokeWidth={2} style={{ color: active ? accent : undefined }} />
                  <span className="truncate text-sm min-w-0">{item.name}</span>
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
            <LogOut className="w-4 h-4" strokeWidth={2} />
            <span className="text-sm font-medium">{loadingSession ? 'Loading...' : 'Logout'}</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'ml-52' : 'ml-0'}`}>
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-secondary-200 flex items-center px-6 shadow-soft">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-lg hover:bg-secondary-100 transition-colors"
          >
            <Menu className="w-5 h-5 text-secondary-600" strokeWidth={2} />
          </button>

          <div className="flex-1" />

          {/* Notifications only (right-most) */}
          <div className="flex items-center">
            <button className="relative p-2 rounded-lg hover:bg-secondary-100 transition-colors">
              <Bell className="w-5 h-5 text-secondary-600" strokeWidth={2} />
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
