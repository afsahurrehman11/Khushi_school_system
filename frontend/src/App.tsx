import React from 'react';
import logger from './utils/logger';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { StudentList, StudentImportExportPage } from './features/students';
import { TeacherList, TeacherDetailPage } from './features/teachers';
import { SubjectList } from './features/subjects';
import { ClassList, ClassDetails, AttendanceList, MarkAttendance } from './features/classes';
import { ChalanList } from './features/chalans';
import { AccountantDashboard, FeePage } from './features/accountant';
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
import SchoolSettings from './pages/SchoolSettings';
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
                  element={<ProtectedRoute element={<AccountantDashboard />} requiredRoles={['Accountant', 'Admin', 'Root']} />}
                />
                <Route
                  path="/fees"
                  element={<ProtectedRoute element={<FeePage />} requiredRoles={['Accountant', 'Admin', 'Root']} />}
                />
                <Route
                  path="/fee-categories"
                  element={<ProtectedRoute element={<FeePage />} requiredRoles={['Accountant', 'Admin', 'Root']} />}
                />
                <Route
                  path="/challans"
                  element={<ProtectedRoute element={<FeePage />} requiredRoles={['Accountant', 'Admin', 'Root']} />}
                />
                
                <Route
                  path="/dashboard/teacher"
                  element={<ProtectedRoute element={<TeacherList />} requiredRoles={['Admin', 'Root', 'Accountant', 'Teacher']} />}
                />
                <Route
                  path="/dashboard/admin"
                  element={<ProtectedRoute element={<AdminDashboard />} requiredRoles={['Admin', 'Root']} />}
                />
                <Route
                  path="/students"
                  element={<ProtectedRoute element={<StudentList />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/subjects"
                  element={<ProtectedRoute element={<SubjectList />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/classes"
                  element={<ProtectedRoute element={<ClassList />} requiredRoles={['Admin', 'Root', 'Accountant', 'Teacher']} />}
                />
                <Route
                  path="/classes/:classId"
                  element={<ProtectedRoute element={<ClassDetails />} requiredRoles={['Admin', 'Root', 'Accountant', 'Teacher']} />}
                />
                <Route
                  path="/classes/:classId/attendance"
                  element={<ProtectedRoute element={<AttendanceList />} requiredRoles={['Admin', 'Root', 'Accountant', 'Teacher']} />}
                />
                <Route
                  path="/classes/:classId/attendance/:date"
                  element={<ProtectedRoute element={<MarkAttendance />} requiredRoles={['Admin', 'Root', 'Accountant', 'Teacher']} />}
                />
                <Route
                  path="/chalans"
                  element={<ProtectedRoute element={<ChalanList />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/students/import-export"
                  element={<ProtectedRoute element={<StudentImportExportPage />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/students/incomplete-data"
                  element={<ProtectedRoute element={<StudentImportExportPage />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/fees/print"
                  element={<ProtectedRoute element={<FeeVoucherPrintPage />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/analytics"
                  element={<ProtectedRoute element={<AnalyticsDashboard />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/teachers"
                  element={<ProtectedRoute element={<TeacherList />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/teachers/:teacherId"
                  element={<ProtectedRoute element={<TeacherDetailPage />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/whatsapp-bot"
                  element={<ProtectedRoute element={<WhatsAppDashboard />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                {/* Face Recognition Routes */}
                <Route
                  path="/face-app"
                  element={<ProtectedRoute element={<FaceDashboard />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/face-app/students"
                  element={<ProtectedRoute element={<FaceStudents />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/face-app/employees"
                  element={<ProtectedRoute element={<FaceEmployees />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/face-app/recognition"
                  element={<ProtectedRoute element={<FaceRecognition />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route
                  path="/face-app/settings"
                  element={<ProtectedRoute element={<FaceSettings />} requiredRoles={['Admin', 'Root', 'Accountant']} />}
                />
                <Route path="/settings" element={
                  <ProtectedRoute element={<SchoolSettings />} requiredRoles={['Admin', 'Root', 'Accountant']} />
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
