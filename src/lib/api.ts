// THE fetch client. Every request in the app goes through here (CLAUDE.md §2).
// Responsibilities: attach Bearer token, build query strings, unwrap the
// response envelope (with the auth exceptions), normalize errors, and handle
// 401 (no refresh endpoint exists — clear token and bounce to /login).
//
// LOCKED once stable — do not add a second client or call fetch elsewhere.

import type {
  ApiErrorBody,
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  User,
} from '../types/api';

// In dev, VITE_API_BASE is empty and requests use relative /api paths proxied
// to the backend. In prod it may point at a separate API origin.
const BASE = import.meta.env.VITE_API_BASE ?? '';

const TOKEN_KEY = 'karen_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// A normalized error every caller can rely on, regardless of which backend
// error shape produced it.
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fields?: Record<string, string[]>;

  constructor(
    message: string,
    status: number,
    code?: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type QueryParams = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: QueryParams;
  // Skip envelope unwrapping — used only for the auth exceptions that return
  // their payload at the top level ({ token, user } / bare user).
  raw?: boolean;
  signal?: AbortSignal;
}

// login/register legitimately return 401/4xx for bad input; those must surface
// to the form, not trigger the session-expired redirect.
function isAuthChallenge(path: string): boolean {
  return (
    path.startsWith('/api/auth/login') || path.startsWith('/api/auth/register')
  );
}

function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) usp.append(key, String(value));
  }
  const query = usp.toString();
  return query ? `?${query}` : '';
}

function toApiError(status: number, json: unknown): ApiError {
  if (status === 429) {
    return new ApiError(
      'Too many attempts. Please try again later.',
      429,
      'RATE_LIMITED',
    );
  }
  const error = (json as ApiErrorBody | null)?.error;
  // Auth routes: plain string. Everything else: { code, message, fields }.
  if (typeof error === 'string') {
    return new ApiError(error, status);
  }
  if (error && typeof error === 'object') {
    return new ApiError(
      error.message ?? `Request failed (${status})`,
      status,
      error.code,
      error.fields,
    );
  }
  return new ApiError(`Request failed (${status})`, status);
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const response = await fetch(BASE + path + buildQuery(opts.params), {
    method: opts.method ?? 'GET',
    headers,
    body,
    signal: opts.signal,
  });

  // 401 on a protected call means the 8h token expired (there is no refresh).
  // Clear it and redirect to login. Auth challenges are exempt so the form can
  // show "Invalid credentials".
  if (response.status === 401 && !isAuthChallenge(path)) {
    setToken(null);
    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      window.location.assign('/login');
    }
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    throw toApiError(response.status, json);
  }

  // Auth exceptions: return the body untouched.
  if (opts.raw) return json as T;

  // Standard envelope: { data: ... } (lists also carry count). Unwrap .data.
  if (json && typeof json === 'object' && 'data' in (json as object)) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', params, signal }),
  post: <T>(path: string, body?: unknown, opts?: { raw?: boolean }) =>
    request<T>(path, { method: 'POST', body, raw: opts?.raw }),
  put: <T>(path: string, body?: unknown, opts?: { raw?: boolean }) =>
    request<T>(path, { method: 'PUT', body, raw: opts?.raw }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// Auth helpers that honor the no-unwrap exceptions in one place.
export const authApi = {
  login: (payload: LoginPayload) =>
    api.post<AuthResponse>('/api/auth/login', payload, { raw: true }),
  register: (payload: RegisterPayload) =>
    api.post<AuthResponse>('/api/auth/register', payload, { raw: true }),
  me: () => request<User>('/api/auth/me', { raw: true }),
};
