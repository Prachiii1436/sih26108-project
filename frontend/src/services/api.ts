/**
 * Thin, typed wrapper over the FastAPI backend.
 *
 * Every call funnels through `request()` so that the uniform error envelope
 * (`{ error_code, message, details }`) becomes a real `ApiError` the UI can
 * render, instead of an opaque axios failure.
 */
import axios, { AxiosError, type AxiosInstance } from 'axios';

import type {
  AnalyticsResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  ApiErrorEnvelope,
  CompareResponse,
  ExtractResponse,
  HealthResponse,
  Recommendation,
  RecommendationRequest,
  RecommendationResponse,
  SavedStandardCreate,
  SavedStandardItem,
  SavedStandardUpdate,
  SearchHistoryCreate,
  SearchHistoryItem,
  SearchHistoryListResponse,
  StandardDetail,
  StandardFacets,
  StandardListResponse,
  StandardQuery,
} from '@/types/api';

/**
 * Demo mode identifies the acting officer with a stable `X-User-Id`, so search
 * history and shortlists are per-officer. Override with VITE_USER_ID.
 */
export const USER_ID: string = import.meta.env.VITE_USER_ID || '1';
export const USER_EMAIL: string = import.meta.env.VITE_USER_EMAIL || 'demo.procurement.officer@sih26108.local';

/**
 * Where the API lives, relative to the app:
 *   - VITE_API_URL wins when set (absolute URL or explicit path);
 *   - otherwise `<app base>/api`: `/api` on the Vite dev server, and
 *     `/sih26108-project/api` in the XAMPP build, where ../.htaccess proxies it
 *     to FastAPI on 127.0.0.1:8000.
 */
export const API_BASE_URL: string = (
  (import.meta.env.VITE_API_URL || '').trim() ||
  `${(import.meta.env.BASE_URL || '/').replace(/\/+$/, '')}/api`
).replace(/\/+$/, '');

const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 120_000);

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

http.defaults.headers.common['X-User-Id'] = USER_ID;
http.defaults.headers.common['X-User-Email'] = USER_EMAIL;

/** Normalised, renderable error. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown> | null;
  /** True when the request never reached the backend. */
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    status: number,
    code: string,
    details?: Record<string, unknown> | null,
    isNetworkError = false,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? null;
    this.isNetworkError = isNetworkError;
  }

  /** Per-field messages, when the backend rejected a pydantic model. */
  fieldErrors(): { field: string; message: string }[] {
    const fields = this.details?.fields;
    if (!Array.isArray(fields)) return [];
    return fields
      .map((f) => {
        const record = f as Record<string, unknown>;
        return {
          field: String(record.field ?? ''),
          message: String(record.message ?? ''),
        };
      })
      .filter((f) => f.field.length > 0);
  }
}

function isEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error_code' in value &&
    'message' in value &&
    typeof (value as ApiErrorEnvelope).message === 'string'
  );
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
    // No response: backend down, DNS fail, CORS block, or client-side timeout.
    if (!axiosError.response) {
      const timedOut = axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT';
      return new ApiError(
        timedOut
          ? 'The request to the analysis engine timed out. The specification may be very long, or the engine is busy. Please try again.'
          : 'Cannot reach the analysis engine. Confirm the FastAPI backend is running and reachable, then retry.',
        0,
        timedOut ? 'timeout' : 'network_error',
        null,
        true,
      );
    }

    const { status, data } = axiosError.response;
    if (isEnvelope(data)) {
      return new ApiError(data.message, status, data.error_code, data.details);
    }
    if (typeof data === 'string' && data.trim()) {
      return new ApiError(data, status, 'http_error');
    }
    return new ApiError(`Request failed with status ${status}.`, status, 'http_error');
  }

  if (error instanceof Error) {
    return new ApiError(error.message, 0, 'unexpected_error', null, true);
  }
  return new ApiError('An unexpected error occurred.', 0, 'unexpected_error', null, true);
}

/** Drop null/undefined/'' so we never send `?sector=` noise. */
function compact(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ system */

export const getHealth = () => request<HealthResponse>(() => http.get('/health'));

/* ---------------------------------------------------------------- analysis */

export const analyze = (payload: AnalyzeRequest) =>
  request<AnalyzeResponse>(() => http.post('/analyze', payload));

export const rescore = (payload: RecommendationRequest) =>
  request<RecommendationResponse>(() => http.post('/recommendations', payload));

export const extractOnly = (payload: AnalyzeRequest) =>
  request<ExtractResponse>(() => http.post('/analyze/extract', payload));

/* --------------------------------------------------------------- standards */

export const listStandards = (query: StandardQuery = {}) =>
  request<StandardListResponse>(() => http.get('/standards', { params: compact({ ...query }) }));

export const getStandardFacets = () => request<StandardFacets>(() => http.get('/standards/facets'));

export const getStandard = (id: number) => request<StandardDetail>(() => http.get(`/standards/${id}`));

export const compareStandards = (standardIds: number[], queryId?: number | null) =>
  request<CompareResponse>(() =>
    http.post('/compare', { standard_ids: standardIds, query_id: queryId ?? null }),
  );

/* ---------------------------------------------------------------- history */

export const listSearchHistory = (params: {
  search?: string;
  sector?: string;
  page?: number;
  page_size?: number;
  include_recommendations?: boolean;
}) => request<SearchHistoryListResponse>(() => http.get('/search-history', { params: compact(params) }));

/** One history entry; the backend always hydrates its stored recommendations. */
export const getSearchHistoryItem = (id: number) =>
  request<SearchHistoryItem>(() => http.get(`/search-history/${id}`));

export const createSearchHistory = (payload: SearchHistoryCreate) =>
  request<SearchHistoryItem>(() => http.post('/search-history', payload));

export const updateSearchHistory = (id: number, payload: { notes?: string; status?: string }) =>
  request<SearchHistoryItem>(() => http.patch(`/search-history/${id}`, payload));

export const deleteSearchHistory = (id: number) =>
  request<void>(() => http.delete(`/search-history/${id}`));

export const getHistorySectors = () =>
  request<{ sectors: string[] }>(() => http.get('/search-history/meta/sectors'));

/* --------------------------------------------------------- saved standards */

export const listSavedStandards = (params: { search?: string; tag?: string; page?: number; page_size?: number }) =>
  request<SavedStandardItem[]>(() => http.get('/saved-standards', { params: compact(params) }));

export const getSavedStandardIds = () =>
  request<{ standard_ids: number[] }>(() => http.get('/saved-standards/ids'));

export const getSavedTags = () => request<{ tags: string[] }>(() => http.get('/saved-standards/tags'));

export const saveStandard = (payload: SavedStandardCreate) =>
  request<SavedStandardItem>(() => http.post('/saved-standards', payload));

export const updateSavedStandard = (id: number, payload: SavedStandardUpdate) =>
  request<SavedStandardItem>(() => http.patch(`/saved-standards/${id}`, payload));

export const deleteSavedStandard = (id: number) => request<void>(() => http.delete(`/saved-standards/${id}`));

/* --------------------------------------------------------------- analytics */

export const getAnalytics = (days = 30) =>
  request<AnalyticsResponse>(() => http.get('/analytics', { params: { days } }));

/* ---------------------------------------------------------- example specs */

export type ExampleQuery = { label: string; sector: string; text: string };

/** Used by the "Example Query" control on the Home / New Query screens. */
export const EXAMPLE_QUERIES: ExampleQuery[] = [
  {
    label: 'Safety helmets',
    sector: 'Safety & Protection',
    text: 'We need to purchase 1000 safety helmets for construction workers. The helmets should be made of suitable material and provide protection against mechanical impact and penetration.',
  },
  {
    label: 'XLPE insulated cable',
    sector: 'Electrical',
    text: 'Supply of 0.75 to 4 square mm XLPE insulated and PVC sheathed multicore copper power cables for a 400V distribution network. Cables should be flame retardant, tested as per IS 1428 type.',
  },
  {
    label: 'Portland cement',
    sector: 'Construction',
    text: 'Procurement of ordinary Portland cement for a reinforced concrete building. Cement should have 43 grade or above with consistent setting time and adequate compressive strength at 28 days.',
  },
  {
    label: 'Borewell hand pumps',
    sector: 'Water',
    text: 'Supply and installation of hand pumps for village water supply scheme in rural districts. Pumps must be suitable for 100 mm bore, rugged cast iron body and work reliably for 15 hours per day.',
  },
  {
    label: 'Cotton bed sheets',
    sector: 'Textiles',
    text: 'Procurement of cotton woven bed sheets for government hospital wards. Fabric should be bleached, sanitised, colour fast to washing and have a minimum of 60 threads per cm for hospital grade use.',
  },
  {
    label: 'Solar water heater',
    sector: 'Energy',
    text: 'Supply and installation of solar water heater units of 2 litres per square metre per day capacity for a government hostel. Units should be IS certified type tested, with 15 year warranty and tested for solar absorber coating.',
  },
];

export type { Recommendation };
