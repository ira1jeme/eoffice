import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/Layout/ProtectedRoute';
import { AppLayout } from './components/Layout/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { TaskList } from './pages/Tasks/TaskList';
import { TaskDetail } from './pages/Tasks/TaskDetail';
import { TaskCreate } from './pages/Tasks/TaskCreate';
import { PendingMonitor } from './pages/PendingMonitor';
import { Staff } from './pages/Staff';
import { Leave } from './pages/Leave';
import { Reports } from './pages/Reports';
import { AuditLog } from './pages/AuditLog';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<TaskList />} />
            <Route
              path="/tasks/new"
              element={
                  <TaskCreate />
              }
            />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/leave" element={<Leave />} />
            <Route
              path="/pending-monitor"
              element={
                <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
                  <PendingMonitor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff"
              element={
                <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
                  <Staff />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-log"
              element={
                <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
                  <AuditLog />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
