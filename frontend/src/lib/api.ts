/**
 * Minimal axios wrapper for the FastAPI backend.
 *
 * Only the four endpoints the guided workflow needs are wrapped, so there is one
 * obvious place to look when something fails.
 */
import axios, { AxiosError, type AxiosInstance } from 'axios';

const BASE_URL: string = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 180_000);

/** Demo officer identity sent as a header; the backend runs in demo mode. */
const USER_ID: string = import.meta.env.VITE_USER_ID || '1';

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

http.defaults.headers.common['X-User-Id'] = USER_ID;

export class ApiError extends Error {
  readonly status: number;
  /** True when the request never reached the backend. */
  readonly isNetworkError: boolean;

  constructor(message: string, status: number, isNetworkError = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
  }
}

export async function request<T>(fn: () => Promise<{ data: T }>): Promise<T> {
  try {
    const response = await fn();
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  const axiosError = error as AxiosError<unknown>;
  if (axiosError?.isAxiosError) {
    if (!axiosError.response) {
      const timedOut = axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT';
      return new ApiError(
        timedOut
          ? 'The analysis took too long to respond. Please try again.'
          : 'Cannot reach the analysis service. Please make sure it is running, then try again.',
        0,
        true,
      );
    }

    const { status, data } = axiosError.response;
    // FastAPI validation errors arrive as { detail: string | { msg, loc }[] }.
    if (data && typeof data === 'object' && 'detail' in data) {
      const detail = (data as { detail: unknown }).detail;
      if (typeof detail === 'string' && detail.trim()) {
        return new ApiError(detail, status);
      }
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: string };
        return new ApiError(first.msg || 'The request was rejected.', status);
      }
    }
    if (typeof data === 'string' && data.trim()) {
      return new ApiError(data, status);
    }
    return new ApiError(`Request failed (${status}).`, status);
  }

  if (error instanceof Error) return new ApiError(error.message, 0, true);
  return new ApiError('An unexpected error occurred.', 0, true);
}
