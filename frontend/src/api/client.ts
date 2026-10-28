import {
  User,
  Grievance,
  DuplicateMatch,
  NotificationItem,
  AnalyticsOverview,
  Department,
  Category,
  CaseHistoryEntry,
  GrievanceStatus
} from '../types';

const TOKEN_KEY = 'civicfix_session_token';
const USER_KEY = 'civicfix_user_profile';

export const getStoredToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setStoredAuth = (token: string, user: User) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getStoredUser = (): User | null => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const clearStoredAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

// In production (Vercel), VITE_API_URL points to the Render backend.
// In local dev with Vite proxy, it is empty so requests go through /api proxy.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Session-Token'] = token;
  }

  // If body is not FormData, set Content-Type JSON
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Prepend backend base URL only when set (production); otherwise use Vite proxy path
  const url = API_BASE ? `${API_BASE}${endpoint}` : endpoint;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await apiFetch<{ token: string; user: User; message: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredAuth(res.token, res.user);
    return res;
  },

  async register(name: string, email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await apiFetch<{ token: string; user: User; message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setStoredAuth(res.token, res.user);
    return res;
  },

  async getProfile(): Promise<User> {
    const res = await apiFetch<{ user: User }>('/api/auth/me');
    return res.user;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearStoredAuth();
    }
  },

  async getDemoUsers(): Promise<User[]> {
    const res = await apiFetch<{ demo_users: User[] }>('/api/auth/demo-users');
    return res.demo_users;
  },

  // Grievance Tracking & Operations
  async trackPublicGrievance(caseId: string): Promise<Grievance> {
    const res = await apiFetch<{ case: Grievance }>(`/api/grievances/track/${encodeURIComponent(caseId)}`);
    return res.case;
  },

  async checkDuplicates(params: {
    category: string;
    locality: string;
    title: string;
    description: string;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<{ duplicates: DuplicateMatch[]; count: number }> {
    return apiFetch('/api/grievances/check-duplicates', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async createGrievance(formData: FormData): Promise<{ case_id: string; message: string; target_deadline: string }> {
    return apiFetch('/api/grievances', {
      method: 'POST',
      body: formData,
    });
  },

  async supportGrievance(caseId: string): Promise<{ message: string; citizen_support_count: number }> {
    return apiFetch(`/api/grievances/${encodeURIComponent(caseId)}/support`, {
      method: 'POST',
    });
  },

  async listGrievances(filters: {
    status?: string;
    priority?: string;
    category?: string;
    department_id?: number | string;
    risk_level?: string;
    q?: string;
  } = {}): Promise<Grievance[]> {
    const searchParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== '') {
        searchParams.append(key, String(val));
      }
    });
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await apiFetch<{ grievances: Grievance[]; total: number }>(`/api/grievances${query}`);
    return res.grievances;
  },

  async getGrievanceDetail(caseId: string): Promise<Grievance> {
    const res = await apiFetch<{ case: Grievance }>(`/api/grievances/${encodeURIComponent(caseId)}`);
    return res.case;
  },

  async updateStatus(caseId: string, status: GrievanceStatus, note?: string): Promise<{ message: string; status: string }> {
    return apiFetch(`/api/grievances/${encodeURIComponent(caseId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    });
  },

  async resolveGrievance(caseId: string, formData: FormData): Promise<{ message: string; status: string }> {
    return apiFetch(`/api/grievances/${encodeURIComponent(caseId)}/resolve`, {
      method: 'POST',
      body: formData,
    });
  },

  async reopenGrievance(caseId: string, reopen_reason: string): Promise<{ message: string; status: string; reopen_count: number }> {
    return apiFetch(`/api/grievances/${encodeURIComponent(caseId)}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ reopen_reason }),
    });
  },

  async reassignGrievance(caseId: string, officer_id: number, reason: string): Promise<{
    message: string;
    case_id: string;
    assigned_officer_id: number;
    assigned_officer_name: string;
    previous_officer_id?: number;
    previous_officer_name?: string;
    reassignment_count: number;
    old_officer_active_cases?: number;
    new_officer_active_cases?: number;
  }> {
    return apiFetch(`/api/grievances/${encodeURIComponent(caseId)}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ officer_id, reason }),
    });
  },

  async addCaseNote(caseId: string, note: string, is_info_request: boolean = false): Promise<{ message: string }> {
    return apiFetch(`/api/grievances/${encodeURIComponent(caseId)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note, is_info_request }),
    });
  },

  // Analytics & Risk Queue
  async getAnalyticsOverview(deptId?: number): Promise<AnalyticsOverview> {
    const query = deptId ? `?department_id=${deptId}` : '';
    return apiFetch<AnalyticsOverview>(`/api/analytics/overview${query}`);
  },

  async getCategoryBreakdown(deptId?: number): Promise<{ categories: Array<{ category: string; total: number; resolved: number; active: number }> }> {
    const query = deptId ? `?department_id=${deptId}` : '';
    return apiFetch(`/api/analytics/by-category${query}`);
  },

  async getStatusBreakdown(deptId?: number): Promise<{ statuses: Array<{ status: string; count: number }> }> {
    const query = deptId ? `?department_id=${deptId}` : '';
    return apiFetch(`/api/analytics/by-status${query}`);
  },

  async getDepartmentWorkload(): Promise<{ departments: Department[] }> {
    return apiFetch('/api/analytics/department-workload');
  },

  async getTrends(): Promise<{ trends: Array<{ date_val: string; submitted_count: number; resolved_count: number }> }> {
    return apiFetch('/api/analytics/trends');
  },

  async getRiskQueue(deptId?: number): Promise<{ queue: Grievance[]; count: number }> {
    const query = deptId ? `?department_id=${deptId}` : '';
    return apiFetch(`/api/analytics/risk-queue${query}`);
  },

  async listGrievancesSince(since: string): Promise<{ updated_cases: Array<{ case_id: string; updated_at: string; status: string }>; count: number; checked_at: string }> {
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    return apiFetch(`/api/grievances/since${query}`);
  },

  // Admin & System
  async listStaff(role?: string, deptId?: number): Promise<User[]> {
    const searchParams = new URLSearchParams();
    if (role) searchParams.append('role', role);
    if (deptId) searchParams.append('department_id', String(deptId));
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await apiFetch<{ users: User[] }>(`/api/admin/users${query}`);
    return res.users;
  },

  async getDepartments(): Promise<Department[]> {
    const res = await apiFetch<{ departments: Department[] }>('/api/admin/departments');
    return res.departments;
  },

  async getCategories(): Promise<Category[]> {
    const res = await apiFetch<{ categories: Category[] }>('/api/admin/categories');
    return res.categories;
  },

  async updateCategorySLA(catId: number, sla_hours: number): Promise<{ message: string }> {
    return apiFetch(`/api/admin/categories/${catId}`, {
      method: 'PATCH',
      body: JSON.stringify({ sla_hours }),
    });
  },

  async getSystemAuditLogs(limit: number = 100, caseId?: string): Promise<CaseHistoryEntry[]> {
    const searchParams = new URLSearchParams({ limit: String(limit) });
    if (caseId) searchParams.append('case_id', caseId);
    const res = await apiFetch<{ audit_logs: CaseHistoryEntry[] }>(`/api/admin/audit-logs?${searchParams.toString()}`);
    return res.audit_logs;
  },

  async getNotifications(filter: 'all' | 'unread' = 'all'): Promise<{ notifications: NotificationItem[]; unread_count: number; total_count?: number }> {
    return apiFetch(`/api/notifications?filter=${filter}`);
  },

  async markSingleNotificationRead(notificationId: number): Promise<{ message: string; notification: NotificationItem; unread_count: number }> {
    return apiFetch(`/api/notifications/${notificationId}/read`, { method: 'POST' });
  },

  async markAllNotificationsRead(): Promise<{ message: string; marked_count: number; unread_count: number }> {
    return apiFetch('/api/notifications/mark-all-read', { method: 'POST' });
  },

  async markNotificationsRead(): Promise<void> {
    await apiFetch('/api/notifications/mark-all-read', { method: 'POST' });
  },
};
