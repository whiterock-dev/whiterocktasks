/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const AssignTask = lazy(() => import('./pages/AssignTask').then((m) => ({ default: m.AssignTask })));
const RemovalRequest = lazy(() => import('./pages/RemovalRequest').then((m) => ({ default: m.RemovalRequest })));
const RedZone = lazy(() => import('./pages/RedZone').then((m) => ({ default: m.RedZone })));
const Kpi = lazy(() => import('./pages/Kpi').then((m) => ({ default: m.Kpi })));
const TaskTable = lazy(() => import('./pages/TaskTable').then((m) => ({ default: m.TaskTable })));
const CompletedTasks = lazy(() => import('./pages/CompletedTasks').then((m) => ({ default: m.CompletedTasks })));
const ApproveTask = lazy(() => import('./pages/ApproveTask').then((m) => ({ default: m.ApproveTask })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Members = lazy(() => import('./pages/Members').then((m) => ({ default: m.Members })));
const BogusAttachment = lazy(() => import('./pages/BogusAttachment').then((m) => ({ default: m.BogusAttachment })));
const RecurringTasks = lazy(() => import('./pages/RecurringTasks').then((m) => ({ default: m.RecurringTasks })));

const PageFallback = () => <div className="text-slate-500 py-8">Loading...</div>;

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <AuthProvider>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Navigate to="/tasks" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/assign"
              element={
                <ProtectedRoute>
                  <AssignTask />
                </ProtectedRoute>
              }
            />
            <Route
              path="/removal"
              element={
                <ProtectedRoute>
                  <RemovalRequest />
                </ProtectedRoute>
              }
            />
            <Route
              path="/redzone"
              element={
                <ProtectedRoute>
                  <RedZone />
                </ProtectedRoute>
              }
            />
            <Route
              path="/kpi"
              element={
                <ProtectedRoute>
                  <Kpi />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <ProtectedRoute>
                  <TaskTable />
                </ProtectedRoute>
              }
            />
            <Route
              path="/completed-tasks"
              element={
                <ProtectedRoute>
                  <CompletedTasks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/recurring-tasks"
              element={
                <ProtectedRoute>
                  <RecurringTasks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/approve"
              element={
                <ProtectedRoute>
                  <ApproveTask />
                </ProtectedRoute>
              }
            />
            <Route
              path="/members"
              element={
                <ProtectedRoute>
                  <Members />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bogus-attachment"
              element={
                <ProtectedRoute>
                  <BogusAttachment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </HashRouter>
  );
};

export default App;
