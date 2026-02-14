import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { LoginPage } from './features/auth';
import { StudentList } from './features/students';
import { TeacherList } from './features/teachers';
import { SubjectList } from './features/subjects';
import { ClassList } from './features/classes';
import { ChalanList } from './features/chalans';
import API_BASE_URL from './config';
import { AdminDashboard, StudentsAdmin, TeachersAdmin, ClassesAdmin, SubjectsAdmin, StudentImportExport } from './features/admin';
import { AccountantDashboard, FeePage, ReportsPage } from './features/accountant';
import ImportNotificationToast from './features/students/components/ImportNotificationToast';
import NotificationToast from './components/NotificationToast';
// import startNotificationSSE from './features/accountant/services/NotificationSSE';
import { getAuthHeaders } from './utils/api';

interface User {
  id: string;
  email: string;
  role: string;
}

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
      const userJson = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      
      if (!token || !userJson) {
        setIsAuthenticated(false);
        setIsValidating(false);
        return;
      }

      try {
        // Validate token by making a quick API call
        const response = await fetch(`${API_BASE_URL}/api/me`, {
          method: 'GET',
          headers: getAuthHeaders(),
        });

        if (response.ok) {
          setIsAuthenticated(true);
          
          // Check role requirements
          if (requiredRoles) {
            const user: User = JSON.parse(userJson);
            const roleName = typeof (user as any).role === 'string' ? (user as any).role : (user as any).role?.name;
            
            if (roleName && requiredRoles.includes(roleName)) {
              setHasRequiredRole(true);
            } else {
              setHasRequiredRole(false);
            }
          } else {
            setHasRequiredRole(true);
          }
        } else {
          // Token is invalid, clear it
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setIsAuthenticated(false);
        }
      } catch (error) {
        // Network error or other issue, clear token to be safe
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setIsAuthenticated(false);
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
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && !hasRequiredRole) {
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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <ErrorBoundary>
      <Router>
        <ImportNotificationToast />
        <Routes>
        <Route path="/login" element={<LoginPage />} />
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
                  path="/dashboard/admin"
                  element={<ProtectedRoute element={<AdminDashboard />} requiredRoles={['Admin']} />}
                />
                <Route
                  path="/dashboard/admin/students"
                  element={<ProtectedRoute element={<StudentsAdmin />} requiredRoles={['Admin']} />}
                />
                <Route
                  path="/dashboard/admin/teachers"
                  element={<ProtectedRoute element={<TeachersAdmin />} requiredRoles={['Admin']} />}
                />
                <Route
                  path="/dashboard/admin/classes"
                  element={<ProtectedRoute element={<ClassesAdmin />} requiredRoles={['Admin']} />}
                />
                <Route
                  path="/dashboard/admin/subjects"
                  element={<ProtectedRoute element={<SubjectsAdmin />} requiredRoles={['Admin']} />}
                />
                <Route
                  path="/dashboard/admin/students/import-export"
                  element={<ProtectedRoute element={<StudentImportExport />} requiredRoles={['Admin', 'Accountant', 'Teacher']} />}
                />
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
                  path="/chalans"
                  element={<ProtectedRoute element={<ChalanList />} requiredRoles={['Admin', 'Accountant']} />}
                />
                <Route
                  path="/students/import-export"
                  element={<ProtectedRoute element={<StudentImportExport />} requiredRoles={['Admin', 'Teacher', 'Accountant']} />}
                />
                <Route
                  path="/teachers"
                  element={<ProtectedRoute element={<TeacherList />} requiredRoles={['Admin']} />}
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
