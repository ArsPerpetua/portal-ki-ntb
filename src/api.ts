const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787/api';
const TOKEN_KEY = 'portal_ki_ntb_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(options.body instanceof FormData) && options.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent('portal:unauthorized'));
  }
  if (!res.ok) {
    let message = `Permintaan gagal (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPERADMIN' | 'STAF' | 'PIMPINAN';
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: SessionUser }>('/auth/me'),

  indicators: () => request<{ indicators: ApiIndicator[] }>('/indicators'),
  indicatorDetail: (code: string, params?: { district?: string; status?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<IndicatorDetailResponse>(`/indicators/${code}${qs ? `?${qs}` : ''}`);
  },
  createRecord: (code: string, payload: { name: string; district: string; year: number; referenceNo?: string; description?: string; submit?: boolean }) =>
    request<{ id: string }>(`/indicators/${code}/records`, { method: 'POST', body: JSON.stringify(payload) }),
  verifyRecord: (id: string, decision: 'VERIFIED' | 'REJECTED', reason?: string) =>
    request<{ ok: boolean }>(`/records/${id}/verify`, { method: 'POST', body: JSON.stringify({ decision, reason }) }),
  recordDetail: (id: string) => request<ApiRecordDetailResponse>(`/records/${id}`),

  documents: (params?: { category?: string; indicator?: string; q?: string }) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v))).toString();
    return request<{ documents: ApiDocument[] }>(`/documents${qs ? `?${qs}` : ''}`);
  },
  uploadDocument: async (params: { file: File; title: string; category: string; indicatorCode?: string }) => {
    const { file, title, category, indicatorCode } = params;
    const { sessionUrl } = await request<{ sessionUrl: string }>('/documents/upload-session', {
      method: 'POST',
      body: JSON.stringify({ title, fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size }),
    });
    const putRes = await fetch(sessionUrl, { method: 'PUT', body: file });
    if (!putRes.ok) throw new ApiError(putRes.status, 'Gagal mengunggah berkas ke Drive.');
    const driveFile = (await putRes.json()) as { id: string };
    return request<{ id: string }>('/documents/upload-complete', {
      method: 'POST',
      body: JSON.stringify({ driveFileId: driveFile.id, title, category, indicatorCode }),
    });
  },
  archiveDocument: (id: string) => request<{ ok: boolean }>(`/documents/${id}/archive`, { method: 'POST' }),

  applications: () => request<{ applications: ApiApplication[] }>('/applications'),
  activity: () => request<{ activity: ApiActivity[] }>('/activity'),
  auditLogs: (limit = 50) => request<{ logs: ApiAuditLog[] }>(`/audit-logs?limit=${limit}`),

  adminUsers: () => request<{ users: ApiUser[] }>('/admin/users'),
  adminAssignments: () => request<{ assignments: ApiAssignment[] }>('/admin/assignments'),
  adminAssign: (payload: { userId: string; indicatorCode: string; canWrite: boolean; canVerify: boolean }) =>
    request<{ id: string }>('/admin/assignments', { method: 'POST', body: JSON.stringify(payload) }),
  adminUnassign: (id: string) => request<{ ok: boolean }>(`/admin/assignments/${id}`, { method: 'DELETE' }),
};

export async function downloadDocumentBlob(id: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/documents/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, 'Gagal mengunduh dokumen.');

  let blob: Blob;
  if (res.headers.get('Content-Type')?.includes('application/json')) {
    const { downloadUrl, accessToken } = (await res.json()) as { downloadUrl: string; accessToken: string };
    const fileRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!fileRes.ok) throw new ApiError(fileRes.status, 'Gagal mengunduh dokumen dari Drive.');
    blob = await fileRes.blob();
  } else {
    blob = await res.blob();
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ApiIndicator {
  id: string;
  label: string;
  short: string;
  unit: string;
  countingDefinition: string;
  value: number;
  isManual: boolean;
  pendingReview: number;
  documentCount: number;
  delta: number;
  trend: number[];
}

export interface ApiRecord {
  id: string;
  name: string;
  district: string;
  year: number;
  reference_no: string | null;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'ARCHIVED';
  attributes: Record<string, unknown>;
  description: string | null;
  created_at: string;
  verified_at: string | null;
}

export interface IndicatorDetailResponse {
  indicator: { id: string; code: string; name: string; short_name: string; unit: string; counting_definition: string; mode: string; manual_value: number | null };
  content: { body_md: string; updated_at: string } | null;
  records: ApiRecord[];
  assignment: { can_write: boolean; can_verify: boolean } | null;
}

export interface ApiRecordDetailResponse {
  record: ApiRecord & {
    indicator_id: string;
    indicator_code: string;
    indicator_short_name: string;
    created_by_name: string | null;
    verified_by_name: string | null;
    rejection_reason: string | null;
  };
  documents: { id: string; title: string; category: string; mime_type: string; size_bytes: number }[];
  canVerify: boolean;
}

export interface ApiDocument {
  id: string;
  title: string;
  category: string;
  mime_type: string;
  size_bytes: number;
  classification: string;
  status: string;
  created_at: string;
  owner_name: string | null;
  indicators: string[] | null;
}

export interface ApiApplication {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string | null;
  sort_order: number;
}

export interface ApiActivity {
  kind: 'record' | 'document';
  id: string;
  title: string;
  context: string;
  status: string;
  at: string | null;
  created_at: string;
}

export interface ApiAuditLog {
  id: string;
  action: string;
  object_type: string;
  object_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
  actor_role: string | null;
}

export interface ApiUser {
  id: string;
  email: string;
  full_name: string;
  role: 'SUPERADMIN' | 'STAF' | 'PIMPINAN';
  is_active: boolean;
  created_at: string;
}

export interface ApiAssignment {
  id: string;
  user_id: string;
  user_name: string;
  indicator_id: string;
  indicator_name: string;
  can_write: boolean;
  can_verify: boolean;
}
