import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import type { ApiResponse, PaginatedResponse } from "@chatcraft/shared";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.detail?.code ?? error.response?.data?.code;

    if (status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }

    if (
      typeof window !== "undefined" &&
      (status === 429 || code === "USAGE_LIMIT_REACHED" || code === "MESSAGE_CAP_REACHED")
    ) {
      const { useAppStore } = await import("@/store");
      useAppStore.getState().openUpgradeModal(
        error.response?.data?.detail?.error ?? "You've reached your usage limit"
      );
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
