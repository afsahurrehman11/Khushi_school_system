import React from 'react';
import logger from './utils/logger';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { StudentList, StudentImportExportPage } from './features/students';
import { TeacherList } from './features/teachers';
import { SubjectList } from './features/subjects';
import { ClassList, ClassDetails, AttendanceList, MarkAttendance } from './features/classes';
import { ChalanList } from './features/chalans';
import { config } from './config';
import { AccountantDashboard, FeePage, ReportsPage } from './features/accountant';
import { AdminDashboard } from './features/admin';
import { WhatsAppDashboard } from './features/whatsapp';
import { FaceDashboard, FaceStudents, FaceEmployees, FaceRecognition, FaceSettings } from './features/face';
import ImportNotificationToast from './features/students/components/ImportNotificationToast';
import NotificationToast from './components/NotificationToast';
// import startNotificationSSE from './features/accountant/services/NotificationSSE';
import LoginPageNew from './pages/Login';
import RootAdminDashboard from './pages/RootAdminDashboard';
import BillingDashboard from './pages/BillingDashboard';
import FeeVoucherPrintPage from './pages/FeeVoucherPrintPage';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import { authService } from './services/auth';

interface ProtectedRouteProps {
  element: React.ReactNode;
  requiredRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ element, requiredRoles }) => {
  const [isValidating, setIsValidating] = React.useState(true);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [hasRequiredRole, setHasRequiredRole] = React.useState(false);

  React.useEffect(() => {
    const validateAuth = async () => {
      const token = authService.getToken();
      const user = authService.getUser();
      
      if (!token || !user) {
        logger.info('AUTH', 'No token or user found');
        setIsAuthenticated(false);
        setIsValidating(false);
        return;
      }

      // Check if token is expired
      if (authService.isTokenExpired()) {
        logger.info('AUTH', 'Token expired, clearing');
        authService.logout();
        setIsAuthenticated(false);
        setIsValidating(false);
        return;
      }

      logger.info('AUTH', `Token validated for ${user.email}`);
      setIsAuthenticated(true);
      
      // Check role requirements
      if (requiredRoles) {
        const userRole = user.role;
        if (userRole && requiredRoles.includes(userRole)) {
          setHasRequiredRole(true);
        } else {
          logger.warn('AUTH', `User role "${userRole}" not in required roles: ${JSON.stringify(requiredRoles)}`);
          setHasRequiredRole(false);
        }
      } else {
        setHasRequiredRole(true);
      }
      
      setIsValidating(false);
    };

    validateAuth();
  }, [requiredRoles]);

  if (isValidating) {
    // Show loading while validating
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Validating authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    logger.info('AUTH', 'User not authenticated, redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && !hasRequiredRole) {
    logger.info('AUTH', 'User does not have required role, redirecting to /unauthorized');
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{element}</>;
};

function App() {
  React.useEffect(() => {
    // Backend health check
    const checkBackend = async () => {
      const isDev = import.meta.env.DEV;
      
      // Log environment mode
      console.log(`%c[ENVIRONMENT] Running in ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'} mode`, 
        isDev ? 'color: orange; font-weight: bold' : 'color: green; font-weight: bold');
      console.log(`%c[BACKEND] Initial API URL: ${config.API_BASE_URL}`, 'color: cyan');
      
      // In production build, only use Render backend
      if (!isDev) {
        try {
          const response = await fetch('https://khushi-school-system.onrender.com/health', { method: 'GET' });
          if (response.ok) {
            logger.info('BACKEND', 'Health check passed - connected to PRODUCTION backend (Render)');
            config.API_BASE_URL = 'https://khushi-school-system.onrender.com/api';
            console.log('%c[BACKEND] ✅ Connected to: https://khushi-school-system.onrender.com/api', 'color: lime; font-weight: bold');
          } else {
            logger.warn('BACKEND', 'Health check failed - Render backend not responding');
            console.log('%c[BACKEND] ⚠️ Render backend not responding', 'color: yellow; font-weight: bold');
          }
        } catch (error) {
          logger.error('BACKEND', `Health check error - Render backend unreachable: ${String(error)}`);
          console.log('%c[BACKEND] ❌ Failed to connect to Render backend', 'color: red; font-weight: bold');
        }
        return;
      }
      
      // In development, try localhost ports first
      const ports = [8000, 8001, 8002, 8003, 8004];
      for (const port of ports) {
        try {
          const response = await fetch(`http://localhost:${port}/health`, { method: 'GET' });
          if (response.ok) {
            logger.info('BACKEND', `Health check passed - backend is running on port ${port}`);
            config.API_BASE_URL = `http://localhost:${port}/api`;
            console.log(`%c[BACKEND] ✅ Connected to: http://localhost:${port}/api (DEVELOPMENT)`, 'color: lime; font-weight: bold');
            return;
          }
        } catch (error) {
          // Continue to next port
        }
      }
      // If no local port works in dev, try production as fallback
      try {
        const response = await fetch('https://khushi-school-system.onrender.com/health', { method: 'GET' });
        if (response.ok) {
          logger.info('BACKEND', 'Health check passed - falling back to Render backend');
          config.API_BASE_URL = 'https://khushi-school-system.onrender.com/api';
          console.log('%c[BACKEND] ✅ Fallback to: https://khushi-school-system.onrender.com/api', 'color: lime; font-weight: bold');
        } else {
          logger.warn('BACKEND', 'Health check failed - no backend available');
          console.log('%c[BACKEND] ⚠️ No backend available', 'color: yellow; font-weight: bold');
        }
      } catch (error) {
        logger.error('BACKEND', `Health check error - no backend available: ${String(error)}`);
        console.log('%c[BACKEND] ❌ No backend available', 'color: red; font-weight: bold');
      }
    };
    checkBackend();

    const enableNotifications = import.meta.env.VITE_ENABLE_NOTIFICATIONS === 'true'
    if (!enableNotifications) return
    // const stop = startNotificationSSE();
    // return () => stop();
  }, []);
  const handleLogout = () => {
    logger.info('AUTH', 'Logging out...');
    authService.logout();
    window.location.href = '#/login';
  };

  return (
    <ErrorBoundary>
      <Router>
        <ImportNotificationToast />
        <Routes>
        <Route path="/login" element={<LoginPageNew />} />
        <Route path="/root-admin" element={
          <ProtectedRoute 
            element={<RootAdminDashboard />} 
            requiredRoles={['Root']} 
          />
        } />
        <Route path="/billing" element={
          <ProtectedRoute 
            element={<BillingDashboard />} 
            requiredRoles={['Root']} 
          />
        } />
        <Route path="/admin" element={
          <ProtectedRoute 
            element={<Navigate to="/students" replace />} 
            requiredRoles={['Admin']} 
          />
        } />
        <Route path="/unauthorized" element={
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Access Denied</h1>
              <p className="text-gray-600 mb-6">You do not have permission to access this page.</p>
              <a href="/login" className="text-indigo-600 hover:text-indigo-700">Back to Login</a>
            </div>
          </div>
        } />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute element={<Navigate to="/students" replace />} />
          }
        />
        <Route
          path="/"
          element={<Navigate to="/login" replace />}
        />
        <Route
          path="/*"
          element={
            <Layout onLogout={handleLogout}>
              <Routes>
                <Route
                  path="/dashboard/accountant"
                  element={<ProtectedRoute element={<AccountantDashboard />} requiredRoles={['Accountant', 'Admin']} />}
                />
                <Route
                  path="/fees"
                  element={<ProtectedRoute element={<FeePage />} requiredRoles={['Accountant', 'Admin']} />}
                />
                <Route
                  path="/fee-categories"
                  element={<ProtectedRoute element={<FeePage />} requiredRoles={['Accountant', 'Admin']} />}
                />
                <Route
                  path="/challans"
                  element={<ProtectedRoute element={<FeePage />} requiredRoles={['Accountant', 'Admin']} />}
                />
                <Route
                  path="/reports"
                  element={<ProtectedRoute element={<ReportsPage />} requiredRoles={['Accountant', 'Admin', 'Admin']} />}
                />
                <Route
                  path="/dashboard/teacher"
                  element={<ProtectedRoute element={<TeacherList />} requiredRoles={['Teacher', 'Admin']} />}
                />
                <Route
                  path="/dashboard/admin"
                  element={<ProtectedRoute element={<AdminDashboard />} requiredRoles={['Admin', 'Root']} />}
                />
                <Route
                  path="/students"
                  element={<ProtectedRoute element={<StudentList />} requiredRoles={['Admin', 'Teacher', 'Accountant']} />}
                />
                <Route
                  path="/subjects"
                  element={<ProtectedRoute element={<SubjectList />} requiredRoles={['Admin', 'Teacher']} />}
                />
                <Route
                  path="/classes"
                  element={<ProtectedRoute element={<ClassList />} requiredRoles={['Admin', 'Teacher']} />}
                />
                <Route
                  path="/classes/:classId"
                  element={<ProtectedRoute element={<ClassDetails />} requiredRoles={['Admin', 'Teacher']} />}
                />
                <Route
                  path="/classes/:classId/attendance"
                  element={<ProtectedRoute element={<AttendanceList />} requiredRoles={['Admin', 'Teacher']} />}
                />
                <Route
                  path="/classes/:classId/attendance/:date"
                  element={<ProtectedRoute element={<MarkAttendance />} requiredRoles={['Admin', 'Teacher']} />}
                />
                <Route
                  path="/chalans"
                  element={<ProtectedRoute element={<ChalanList />} requiredRoles={['Admin', 'Accountant']} />}
                />
                <Route
                  path="/students/import-export"
                  element={<ProtectedRoute element={<StudentImportExportPage />} requiredRoles={['Admin', 'Teacher', 'Accountant']} />}
                />
                <Route
                  path="/students/incomplete-data"
                  element={<ProtectedRoute element={<StudentImportExportPage />} requiredRoles={['Admin']} />}
                />
                <Route
                  path="/fees/print"
                  element={<ProtectedRoute element={<FeeVoucherPrintPage />} requiredRoles={['Admin', 'Accountant']} />}
                />
                <Route
                  path="/analytics"
                  element={<ProtectedRoute element={<AnalyticsDashboard />} requiredRoles={['Admin']} />}
                />
                <Route
                  path="/teachers"
                  element={<ProtectedRoute element={<TeacherList />} requiredRoles={['Admin']} />}
                />
                <Route
                  path="/whatsapp-bot"
                  element={<ProtectedRoute element={<WhatsAppDashboard />} requiredRoles={['Admin']} />}
                />
                {/* Face Recognition Routes */}
                <Route
                  path="/face-app"
                  element={<ProtectedRoute element={<FaceDashboard />} requiredRoles={['Admin', 'Teacher']} />}
                />
                <Route
                  path="/face-app/students"
                  element={<ProtectedRoute element={<FaceStudents />} requiredRoles={['Admin', 'Teacher']} />}
                />
                <Route
                  path="/face-app/employees"
                  element={<ProtectedRoute element={<FaceEmployees />} requiredRoles={['Admin']} />}
                />
                <Route
                  path="/face-app/recognition"
                  element={<ProtectedRoute element={<FaceRecognition />} requiredRoles={['Admin', 'Teacher']} />}
                />
                <Route
                  path="/face-app/settings"
                  element={<ProtectedRoute element={<FaceSettings />} requiredRoles={['Admin']} />}
                />
                <Route path="/settings" element={
                  <ProtectedRoute element={
                    <div className="min-h-screen bg-secondary-50 p-8">
                      <div className="max-w-7xl mx-auto">
                        <h1 className="text-3xl font-bold text-secondary-900 mb-2">Settings</h1>
                        <div className="bg-white rounded-xl shadow-soft p-8 text-center">
                          <p className="text-secondary-600">Settings page coming soon...</p>
                        </div>
                      </div>
                    </div>
                  } />
                } />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </Router>
        <NotificationToast />
      </ErrorBoundary>
  );
}

export default App;
