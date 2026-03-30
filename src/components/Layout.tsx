/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import {
  ClipboardList,
  Trash2,
  AlertTriangle,
  BarChart3,
  Table2,
  ClipboardCheck,
  CheckCircle2,
  Settings,
  LogOut,
  Menu,
  X,
  Users,
  Repeat,
} from 'lucide-react';

const roleLabels: Record<UserRole, string> = {
  [UserRole.OWNER]: 'Owner',
  [UserRole.MANAGER]: 'Manager',
  [UserRole.DOER]: 'Doer',
  [UserRole.AUDITOR]: 'Auditor',
  [UserRole.VERIFIER]: 'Verifier',
};

const NavItem = ({
  to,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  to: string;
  icon: any;
  label: string;
  active: boolean;
  onClick?: () => void;
}) => (
  <Link
    to={to}
    onClick={onClick}
    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${active
      ? 'bg-slate-700 text-white'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
      }`}
  >
    <Icon size={20} className={active ? 'text-white' : 'text-slate-500'} />
    <span>{label}</span>
  </Link>
);

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return <>{children}</>;

  const isDoer = user.role === UserRole.DOER;
  const isAuditor = user.role === UserRole.AUDITOR;
  const isVerifier = user.role === UserRole.VERIFIER;
  const isManager = user.role === UserRole.MANAGER || user.role === UserRole.OWNER;
  const canAssign = [UserRole.OWNER, UserRole.MANAGER, UserRole.DOER].includes(user.role);
  const canSeeRedZone = [UserRole.OWNER, UserRole.MANAGER, UserRole.DOER].includes(user.role);

  const navItems: { to: string; icon: any; label: string }[] = isAuditor
    ? [
      { to: '/tasks', icon: Table2, label: 'Audit Tasks' },
      { to: '/completed-tasks', icon: CheckCircle2, label: 'Completed Tasks' },
      { to: '/approve', icon: ClipboardCheck, label: 'Approve Task' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ]
    : isVerifier
      ? [
        { to: '/completed-tasks', icon: CheckCircle2, label: 'Completed Tasks' },
        { to: '/approve', icon: ClipboardCheck, label: 'Approve Task' },
        { to: '/settings', icon: Settings, label: 'Settings' },
      ]
      : [
        ...(canAssign ? [{ to: '/assign', icon: ClipboardList, label: 'Assign Task' }] : []),
        { to: '/removal', icon: Trash2, label: 'Removal Request' },
        ...(canSeeRedZone ? [{ to: '/redzone', icon: AlertTriangle, label: 'Overdue' }] : []),
        { to: '/kpi', icon: BarChart3, label: 'KPI' },
        { to: '/tasks', icon: Table2, label: 'Task Table' },
        ...(isManager ? [{ to: '/my-tasks', icon: ClipboardList, label: 'My Tasks' }] : []),
        ...(isDoer ? [{ to: '/assigned-by-me', icon: ClipboardList, label: 'Assigned By Me' }] : []),
        { to: '/recurring-tasks', icon: Repeat, label: 'Recurring Tasks' },
        { to: '/completed-tasks', icon: CheckCircle2, label: 'Completed Tasks' },
        { to: '/approve', icon: ClipboardCheck, label: 'Approve Task' },
        ...(isManager ? [{ to: '/members', icon: Users, label: 'Members' }] : []),
        { to: '/settings', icon: Settings, label: 'Settings' },
      ];

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-slate-100/80 flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:h-screen shrink-0 flex-col w-64 bg-white border-r border-slate-200">
        <div className="flex h-24 items-center border-b border-slate-100 px-6">
          <img
            src="/whiterock-logo.png"
            alt="WhiteRock"
            className="h-full w-auto max-h-24 object-contain"
          />
        </div>
        <nav className="flex-1 px-4 pt-5 pb-3 space-y-1">
          {navItems.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              active={location.pathname === item.to}
            />
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <div className="mt-2 flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-sm">
              {user.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800 truncate max-w-35">{user.name}</p>
              <p className="text-xs text-slate-500">{roleLabels[user.role]}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3.5 py-2.5 w-full text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors text-sm font-medium"
          >
            <LogOut size={20} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">WhiteRock Tasks</h1>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-slate-100">
              <span className="font-semibold text-slate-800">Menu</span>
              <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
              {navItems.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  active={location.pathname === item.to}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>
            <div className="p-3 border-t border-slate-100">
              <div className="mt-2 flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-sm">
                  {user.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800 truncate max-w-35">{user.name}</p>
                  <p className="text-xs text-slate-500">{roleLabels[user.role]}</p>
                </div>
              </div>
              <button
                onClick={() => { logout(); setMobileOpen(false); }}
                className="flex items-center gap-3 px-3.5 py-2.5 w-full text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors text-sm font-medium"
              >
                <LogOut size={20} />
                <span>Log out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-h-screen md:min-h-0 md:h-screen md:overflow-y-auto bg-slate-50/50">
        <div className="w-full max-w-450 mx-auto p-4 md:p-8">
          {(() => {
            const pathTitles: Record<string, string> = {
              '/': 'Dashboard',
              '/tasks': 'Task Table',
              '/recurring-tasks': 'Recurring Tasks',
              '/assign': 'Assign Task',
              '/removal': 'Removal Request',
              '/redzone': 'Overdue',
              '/kpi': 'KPI Dashboard',
              '/my-tasks': 'My Tasks',
              '/assigned-by-me': 'Assigned By Me',
              '/members': 'Members',
              '/completed-tasks': 'Completed Tasks',
              '/approve': 'Approve Task',
              '/settings': 'Settings',
            };
            const pageTitle = isAuditor && location.pathname === '/tasks'
              ? 'Audit Tasks'
              : (pathTitles[location.pathname] || 'Dashboard');
            return (
              <>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{pageTitle}</h1>
                <p className="text-slate-500 text-sm mt-1 mb-6">Welcome back, {user.name}</p>
                {children}
              </>
            );
          })()}
        </div>
      </main>
    </div>
  );
}
