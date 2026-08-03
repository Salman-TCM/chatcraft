import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { getSession } from "next-auth/react";
import type { ApiResponse, PaginatedResponse } from "@chatcraft/shared";

// In the browser use same-origin ("") so requests go through Next.js rewrites
// which proxy /api/* to the backend — works from any public URL with no CORS.
// In SSR context use the direct backend URL.
const BASE_URL =
  typeof window !== "undefined"
    ? ""
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach the backend JWT on every request — prefer an active impersonation token
apiClient.interceptors.request.use(async (config) => {
  if (typeof window !== "undefined") {
    const imp = localStorage.getItem("impersonation_session");
    if (imp) {
      try {
        const parsed = JSON.parse(imp);
        if (parsed.token && parsed.expiresAt && Date.now() < parsed.expiresAt) {
          config.headers.Authorization = `Bearer ${parsed.token}`;
          return config;
        }
        localStorage.removeItem("impersonation_session");
      } catch { /* corrupt entry — fall through */ }
    }
    const session = await getSession();
    const token = (session?.user as any)?.accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.detail?.code ?? error.response?.data?.code;

    if (status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }

    if (typeof window !== "undefined" && code === "MESSAGE_CAP_REACHED") {
      const { useAppStore } = await import("@/store");
      const cap = error.response?.data?.detail?.cap ?? 0;
      useAppStore.getState().openHardPaywall(cap);
      return Promise.reject(error);
    }

    if (
      typeof window !== "undefined" &&
      (code === "USAGE_LIMIT_REACHED" || code === "CHATBOT_LIMIT_REACHED" || code === "MODEL_NOT_ALLOWED")
    ) {
      const { useAppStore } = await import("@/store");
      useAppStore.getState().openUpgradeModal(
        error.response?.data?.detail?.error ?? "You've reached your usage limit"
      );
      return Promise.reject(error);
    }

    // Generic rate-limit: show a toast and swallow the error so components
    // without explicit try/catch don't crash with "Unhandled Runtime Error".
    if (status === 429 && typeof window !== "undefined") {
      console.warn("Rate limit hit:", error.config?.url);
      // Fire a custom DOM event so any toast/notification layer can pick it up
      window.dispatchEvent(new CustomEvent("api:ratelimit", { detail: { url: error.config?.url } }));
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export async function apiGet<T>(
  path: string,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> {
  const { data } = await apiClient.get<ApiResponse<T>>(path, config);
  return data;
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> {
  const { data } = await apiClient.post<ApiResponse<T>>(path, body, config);
  return data;
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> {
  const { data } = await apiClient.put<ApiResponse<T>>(path, body, config);
  return data;
}

export async function apiDelete<T>(
  path: string,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> {
  const { data } = await apiClient.delete<ApiResponse<T>>(path, config);
  return data;
}

export async function apiGetPaginated<T>(
  path: string,
  params?: Record<string, unknown>
): Promise<PaginatedResponse<T>> {
  const { data } = await apiClient.get<PaginatedResponse<T>>(path, { params });
  return data;
}
