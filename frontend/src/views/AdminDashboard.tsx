import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Settings,
  History,
  BarChart3,
  RefreshCw,
  PlusCircle,
  Building,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { User, Category, Department, CaseHistoryEntry, AnalyticsOverview } from '../types';
import { api } from '../api/client';

interface AdminDashboardProps {
  currentUser: User;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'categories' | 'users' | 'audit'>('analytics');

  // Data states
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<CaseHistoryEntry[]>([]);
  const [trends, setTrends] = useState<any[]>([]);

  // Search & edit states
  const [auditSearch, setAuditSearch] = useState('');
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [newSlaHours, setNewSlaHours] = useState<number>(48);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchAdminData = async () => {
    try {
      setIsRefreshing(true);
      const results = await Promise.allSettled([
        api.getAnalyticsOverview(),
        api.getCategories(),
        api.getDepartmentWorkload(),
        api.listStaff(),
        api.getSystemAuditLogs(100),
        api.getTrends(),
      ]);

      if (results[0].status === 'fulfilled') setAnalytics(results[0].value);
      if (results[1].status === 'fulfilled') setCategories(results[1].value);
      if (results[2].status === 'fulfilled') setDepartments(results[2].value.departments || []);
      if (results[3].status === 'fulfilled') setUsers(results[3].value);
      if (results[4].status === 'fulfilled') setAuditLogs(results[4].value);
      if (results[5].status === 'fulfilled') setTrends(results[5].value.trends || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [currentUser]);

  const handleUpdateSla = async (catId: number) => {
    if (!newSlaHours || newSlaHours <= 0) {
      alert('SLA hours must be a positive integer.');
      return;
    }
    try {
      await api.updateCategorySLA(catId, newSlaHours);
      setCategories(prev => prev.map(c => c.id === catId ? { ...c, sla_hours: newSlaHours } : c));
      setEditingCatId(null);
      setStatusMessage('Category SLA successfully updated in database.');
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  const COLORS = ['#06B6D4', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E'];

  const filteredLogs = auditLogs.filter(log => {
    if (!auditSearch) return true;
    const q = auditSearch.toLowerCase();
    return (
      log.case_id.toLowerCase().includes(q) ||
      log.actor_name.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.notes && log.notes.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 text-left">
      {/* Admin Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl glass-panel border border-white/5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-purple-950 text-purple-400 border border-purple-800/50">
              System Administrator
            </span>
            <span className="text-xs text-slate-400 truncate">Governance & SLA Configuration Engine</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">Platform Control: {currentUser.name}</h1>
          <p className="text-xs text-slate-400">Configure municipal resolution targets, inspect immutable audit trails, and oversee user roles.</p>
        </div>

        <button
          onClick={fetchAdminData}
          disabled={isRefreshing}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-2 disabled:opacity-50 min-h-[38px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          <span>{isRefreshing ? 'Updating...' : 'Refresh Telemetry'}</span>
        </button>
      </div>

      {statusMessage && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Admin Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-xs font-semibold overflow-x-auto scrollbar-none shrink-0">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 whitespace-nowrap min-h-[38px] ${
            activeTab === 'analytics'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Analytics & Telemetry</span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 whitespace-nowrap min-h-[38px] ${
            activeTab === 'categories'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Settings className="w-3.5 h-3.5 text-blue-400" />
          <span>Category & SLA Rules</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 whitespace-nowrap min-h-[38px] ${
            activeTab === 'users'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-violet-400" />
          <span>User & Role Governance</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3.5 sm:px-4 py-2 rounded-xl transition-all flex items-center gap-2 shrink-0 whitespace-nowrap min-h-[38px] ${
            activeTab === 'audit'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5 text-emerald-400" />
          <span>Certified Audit Inspector</span>
        </button>
      </div>

      {/* Tab 1: Analytics & Charts */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-xl glass-panel border border-white/5">
              <span className="text-xs text-slate-400 block font-semibold">Total System Grievances</span>
              <span className="text-3xl font-mono font-bold text-white">{analytics?.total_grievances ?? 0}</span>
            </div>
            <div className="p-4 rounded-xl glass-panel border border-white/5">
              <span className="text-xs text-emerald-400 block font-semibold">Resolution Rate</span>
              <span className="text-3xl font-mono font-bold text-emerald-400">{analytics?.resolution_rate ?? 0}%</span>
            </div>
            <div className="p-4 rounded-xl glass-panel border border-white/5">
              <span className="text-xs text-rose-400 block font-semibold">Active Overdue Cases</span>
              <span className="text-3xl font-mono font-bold text-rose-400">{analytics?.overdue_grievances ?? 0}</span>
            </div>
            <div className="p-4 rounded-xl glass-panel border border-white/5">
              <span className="text-xs text-blue-400 block font-semibold">Avg Resolution Duration</span>
              <span className="text-3xl font-mono font-bold text-blue-400">{analytics?.avg_resolution_hours ?? 0}h</span>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
            {/* Chart 1: Department Workload Distribution */}
            <div className="p-4 sm:p-6 rounded-2xl glass-panel border border-white/5 space-y-4 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Department Caseload Distribution</h3>
                  <p className="text-[11px] text-slate-400">Total vs Active Caseload by Department</p>
                </div>
                <span className="text-[11px] text-cyan-400 font-mono">Live SQL Query</span>
              </div>
              <div className="h-64 w-full min-w-0">
                {departments.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    No department caseload records available.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departments}>
                      <XAxis dataKey="code" stroke="#64748B" fontSize={11} />
                      <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar dataKey="total_cases" fill="#06B6D4" radius={[4, 4, 0, 0]} name="Total Cases" />
                      <Bar dataKey="active_cases" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Active Cases" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: 30-Day Intake vs Resolution Trend */}
            <div className="p-4 sm:p-6 rounded-2xl glass-panel border border-white/5 space-y-4 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Intake & Resolution Timeline</h3>
                  <p className="text-[11px] text-slate-400">Historical intake vs verified resolution velocity</p>
                </div>
                <span className="text-[11px] text-emerald-400 font-mono">30-Day Dynamic Log</span>
              </div>
              <div className="h-64 w-full min-w-0">
                {trends.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    No historical trend activity recorded yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends}>
                      <XAxis dataKey="date_val" stroke="#64748B" fontSize={11} />
                      <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Line type="monotone" dataKey="submitted_count" stroke="#06B6D4" strokeWidth={2} name="Intake (Submitted)" />
                      <Line type="monotone" dataKey="resolved_count" stroke="#10B981" strokeWidth={2} name="Resolved" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Category & SLA Configuration */}
      {activeTab === 'categories' && (
        <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Category Resolution SLA Hours</h3>
              <p className="text-xs text-slate-400">Adjust target resolution windows enforced by the Early-Warning Engine</p>
            </div>
          </div>

          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-xs text-left min-w-[550px]">
              <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px] border-b border-white/5">
                <tr>
                  <th className="px-6 py-3">Category Name</th>
                  <th className="px-6 py-3">Department</th>
                  <th className="px-6 py-3">Default Priority</th>
                  <th className="px-6 py-3">Configured SLA Window</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No categories configured in municipal database.
                    </td>
                  </tr>
                ) : (
                  categories.map(cat => (
                  <tr key={cat.id} className="hover:bg-slate-800/40">
                    <td className="px-6 py-4 font-semibold text-slate-200">{cat.name}</td>
                    <td className="px-6 py-4 text-slate-400">{cat.department_name}</td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-cyan-400">{cat.default_priority}</span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold">
                      {editingCatId === cat.id ? (
                        <input
                          type="number"
                          value={newSlaHours}
                          onChange={e => setNewSlaHours(Number(e.target.value))}
                          className="w-20 px-2 py-1 rounded bg-slate-900 border border-cyan-500 text-xs text-white"
                        />
                      ) : (
                        <span>{cat.sla_hours} Hours</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {editingCatId === cat.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleUpdateSla(cat.id)}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingCatId(null)}
                            className="text-slate-400 hover:text-white text-[11px]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingCatId(cat.id);
                            setNewSlaHours(cat.sla_hours);
                          }}
                          className="text-cyan-400 hover:underline font-semibold"
                        >
                          Modify SLA
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Users & Role Management */}
      {activeTab === 'users' && (
        <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Registered Users & Assigned Roles</h3>
              <p className="text-xs text-slate-400">Server-enforced role assignments across the 4 roles</p>
            </div>
          </div>

          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-xs text-left min-w-[550px]">
              <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px] border-b border-white/5">
                <tr>
                  <th className="px-6 py-3">Full Name</th>
                  <th className="px-6 py-3">Email Address</th>
                  <th className="px-6 py-3">Role Designation</th>
                  <th className="px-6 py-3">Department</th>
                  <th className="px-6 py-3">Badge Number</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No registered staff or user accounts found.
                    </td>
                  </tr>
                ) : (
                  users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-800/40">
                    <td className="px-6 py-4 font-semibold text-slate-200">{u.name}</td>
                    <td className="px-6 py-4 font-mono text-slate-400">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        u.role === 'admin'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : u.role === 'manager'
                          ? 'bg-blue-950 text-blue-300 border border-blue-800'
                          : u.role === 'officer'
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{u.department_name || 'System Wide'}</td>
                    <td className="px-6 py-4 font-mono text-cyan-400">{u.badge_number || '—'}</td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Immutable Audit Inspector */}
      {activeTab === 'audit' && (
        <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white">Platform Certified Audit Trail</h3>
              <p className="text-xs text-slate-400">Complete immutable record of all case actions, actors, and status shifts</p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                placeholder="Search audit entries..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px] min-w-0">
            <table className="w-full text-xs text-left min-w-[650px]">
              <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px] border-b border-white/5 sticky top-0">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Case ID</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Notes & Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      {auditSearch ? 'No audit entries matching your search filter.' : 'No certified audit history records logged yet.'}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{log.created_at}</td>
                    <td className="px-4 py-3 font-mono text-cyan-400 font-semibold">{log.case_id}</td>
                    <td className="px-4 py-3 text-slate-200">{log.actor_name}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        {log.actor_role}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-200">{log.action}</td>
                    <td className="px-4 py-3 text-slate-300 max-w-xs truncate">{log.notes || '—'}</td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
