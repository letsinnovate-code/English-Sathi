"use client";

/**
 * Client-side API client with automatic token refresh.
 * Tokens stored in memory (access) + HttpOnly-compatible JS cookie (refresh).
 * All calls go to NEXT_PUBLIC_API_URL (default: http://localhost:4000).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const API_PREFIX = "/api/v1";

// ─── In-memory access token (not stored in localStorage — avoids XSS exposure) ──
let _accessToken: string | null = null;

function setAccessToken(token: string | null) {
  _accessToken = token;
}

function getAccessToken(): string | null {
  return _accessToken;
}

// ─── Refresh token stored in a js-cookie (expires 30 days) ─────────────────
const REFRESH_COOKIE = "es_rt";

async function getRefreshToken(): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const Cookies = (await import("js-cookie")).default;
  return Cookies.get(REFRESH_COOKIE) ?? null;
}

async function setRefreshToken(token: string | null) {
  if (typeof document === "undefined") return;
  const Cookies = (await import("js-cookie")).default;
  if (token) {
    Cookies.set(REFRESH_COOKIE, token, { expires: 30, sameSite: "strict" });
  } else {
    Cookies.remove(REFRESH_COOKIE);
  }
}

// ─── Core fetch wrapper ─────────────────────────────────────────────────────

type RequestOptions = {
  method?: string;
  body?: unknown;
  skipAuth?: boolean;
};

async function toApiError(response: Response): Promise<ApiError> {
  const err = await response.json().catch(() => ({}));
  const detailMsg = Array.isArray(err?.details) && err.details[0]?.message
    ? `: ${err.details[0].message}`
    : "";
  return new ApiError(
    response.status,
    `${err?.message ?? "Request failed"}${detailMsg}`,
    err?.details,
  );
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, skipAuth = false } = opts;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!skipAuth && _accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }

  const response = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 401 → attempt token refresh once, then retry
  if (response.status === 401 && !skipAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${_accessToken}`;
      const retryResponse = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!retryResponse.ok) {
        throw await toApiError(retryResponse);
      }
      if (retryResponse.status === 204) return undefined as T;
      return retryResponse.json() as Promise<T>;
    }
    // Refresh failed — clear auth state
    clearAuth();
    throw new ApiError(401, "Session expired. Please log in again.");
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

let _refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const rt = await getRefreshToken();
    if (!rt) return false;
    try {
      const data = await request<{ accessToken: string; refreshToken: string }>(
        "/auth/refresh",
        { method: "POST", body: { refreshToken: rt }, skipAuth: true },
      );
      setAccessToken(data.accessToken);
      await setRefreshToken(data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

export function clearAuth() {
  setAccessToken(null);
  void setRefreshToken(null);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Auth ───────────────────────────────────────────────────────────────────

import type {
  AuthSessionResponseDTO,
  CreateVoiceSessionResponseDTO,
  DashboardSummaryDTO,
  LessonDetailDTO,
  LessonsListDTO,
  ProficiencyLevel,
  UserProfileDTO,
  VoiceQuotaSummaryDTO,
  VoiceSessionDetailDTO,
  VoiceSessionDTO,
  WsSessionEndedPayload,
} from "@english-sathi/shared-types";
import type {
  CreateVoiceSessionInput,
  LoginInput,
  OnboardingInput,
  RegisterUserInput,
  UpdateProfileInput,
} from "@english-sathi/validation";

export async function apiRegister(dto: RegisterUserInput): Promise<AuthSessionResponseDTO> {
  const data = await request<AuthSessionResponseDTO>("/auth/register", {
    method: "POST",
    body: dto,
    skipAuth: true,
  });
  setAccessToken(data.tokens.accessToken);
  await setRefreshToken(data.tokens.refreshToken);
  return data;
}

export async function apiLogin(dto: LoginInput): Promise<AuthSessionResponseDTO> {
  const data = await request<AuthSessionResponseDTO>("/auth/login", {
    method: "POST",
    body: dto,
    skipAuth: true,
  });
  setAccessToken(data.tokens.accessToken);
  await setRefreshToken(data.tokens.refreshToken);
  return data;
}

export async function apiLogout(): Promise<void> {
  const rt = await getRefreshToken();
  try {
    await request<void>("/auth/logout", {
      method: "POST",
      body: { refreshToken: rt ?? undefined, allSessions: false },
    });
  } catch {
    // Best-effort logout
  } finally {
    clearAuth();
  }
}

export async function apiGetMe(): Promise<Omit<AuthSessionResponseDTO, "tokens">> {
  return request<Omit<AuthSessionResponseDTO, "tokens">>("/auth/me");
}

export async function apiCompleteOnboarding(dto: OnboardingInput): Promise<UserProfileDTO> {
  return request<UserProfileDTO>("/users/me/onboarding", { method: "POST", body: dto });
}

export async function apiUpdateProfile(dto: UpdateProfileInput): Promise<UserProfileDTO> {
  return request<UserProfileDTO>("/users/me/profile", { method: "PATCH", body: dto });
}

export async function apiGetDashboard(): Promise<DashboardSummaryDTO> {
  return request<DashboardSummaryDTO>("/dashboard");
}

// ─── Lessons & Voice Sessions ───────────────────────────────────────────────

export async function apiListLessons(params?: {
  level?: ProficiencyLevel;
  category?: string;
  page?: number;
  pageSize?: number;
}): Promise<LessonsListDTO> {
  const qs = new URLSearchParams();
  if (params?.level) qs.set("level", params.level);
  if (params?.category) qs.set("category", params.category);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString();
  return request<LessonsListDTO>(`/lessons${query ? `?${query}` : ""}`);
}

export async function apiGetLesson(slugOrId: string): Promise<LessonDetailDTO> {
  return request<LessonDetailDTO>(`/lessons/${encodeURIComponent(slugOrId)}`);
}

export async function apiGetVoiceQuota(): Promise<VoiceQuotaSummaryDTO> {
  return request<VoiceQuotaSummaryDTO>("/voice/sessions/quota");
}

export async function apiListVoiceSessions(): Promise<VoiceSessionDTO[]> {
  return request<VoiceSessionDTO[]>("/voice/sessions");
}

export async function apiGetVoiceSession(sessionId: string): Promise<VoiceSessionDetailDTO> {
  return request<VoiceSessionDetailDTO>(`/voice/sessions/${encodeURIComponent(sessionId)}`);
}

export async function apiCreateVoiceSession(
  dto: CreateVoiceSessionInput,
): Promise<CreateVoiceSessionResponseDTO> {
  return request<CreateVoiceSessionResponseDTO>("/voice/sessions", {
    method: "POST",
    body: dto,
  });
}

export async function apiEndVoiceSession(
  sessionId: string,
  reason: "user_ended" | "quota_exceeded" | "inactivity_timeout" | "error" = "user_ended",
): Promise<WsSessionEndedPayload> {
  return request<WsSessionEndedPayload>(`/voice/sessions/${encodeURIComponent(sessionId)}/end`, {
    method: "POST",
    body: { reason },
  });
}

export function getApiBaseUrl(): string {
  return API_BASE;
}

export async function ensureAccessToken(): Promise<string | null> {
  if (_accessToken) return _accessToken;
  const refreshed = await tryRefresh();
  return refreshed ? _accessToken : null;
}

// ─── Token bootstrap (call on app load to restore session) ──────────────────

export async function bootstrapSession(): Promise<boolean> {
  const rt = await getRefreshToken();
  if (!rt) return false;
  return tryRefresh();
}

export { getAccessToken };

