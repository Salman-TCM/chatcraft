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
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
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
