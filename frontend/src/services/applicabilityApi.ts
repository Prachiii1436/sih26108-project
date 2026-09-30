/**
 * Client for the applicability demonstrator (SIH26108 Steps 1-10).
 *
 * Every call goes through the shared `request()` helper so backend errors are
 * surfaced as a normalised `ApiError`.
 */
import { request, http } from './api';

import type {
  ApplicabilityAnalyzeRequest,
  ApplicabilityResponse,
  KnowledgeBaseResponse,
  OfficerReview,
  ReviewCreate,
  UploadResponse,
} from '@/types/applicability';

/** Step 1 - extract requirements, retrieve candidates, check applicability. */
export const analyzeApplicability = (payload: ApplicabilityAnalyzeRequest) =>
  request<ApplicabilityResponse>(() => http.post('/applicability/analyze', payload));

/** Step 1 - extract text from an uploaded PDF/TXT tender document. */
export const uploadDocument = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return request<UploadResponse>(() =>
    http.post('/applicability/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    }),
  );
};

/** Browse the curated Prototype Standards Knowledge Base. */
export const getPrototypeKnowledgeBase = () =>
  request<KnowledgeBaseResponse>(() => http.get('/applicability/knowledge-base'));

/** Step 10 - record the officer's accept / reject / modify decision. */
export const submitReview = (payload: ReviewCreate) =>
  request<OfficerReview>(() => http.post('/applicability/review', payload));

/** Step 10 - decisions already recorded in this demo session. */
export const listReviews = (limit = 50) =>
  request<OfficerReview[]>(() => http.get('/applicability/reviews', { params: { limit } }));

/* ------------------------------------------------------------------ demos */

export interface DemoPreset {
  id: string;
  label: string;
  hint: string;
  productName: string;
  specification: string;
  technicalRequirements: string;
}

/**
 * Ready-made specifications so the demo video never depends on typing.
 *
 * * `heater-full`  - the problem-statement example: every status is produced.
 * * `heater-blank` - application is NOT stated, forcing a clarification round.
 * * `helmets`      - a second product family with an excluded / superseded pair.
 */
export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: 'heater-full',
    label: 'Water heater (full spec)',
    hint: 'Produces all six applicability statuses in one report.',
    productName: 'Electric Water Heater',
    specification:
      'Electric water heater, 1000 litre capacity, 230 V, for institutional use.',
    technicalRequirements:
      'Electric storage water heater for a hostel mess. Must carry the ISI mark and comply with applicable safety requirements.',
  },
  {
    id: 'heater-blank',
    label: 'Water heater (application not stated)',
    hint: 'Leaves application and installation location blank -> clarification question.',
    productName: 'Electric Water Heater',
    specification: 'Electric water heater, 1000 litre capacity, 230 V single phase supply.',
    technicalRequirements: 'Must carry the ISI mark and comply with applicable safety requirements.',
  },
  {
    id: 'helmets',
    label: 'Safety helmets',
    hint: 'Second product family - excluded and superseded editions appear.',
    productName: 'Safety Helmet',
    specification: 'Safety helmets for construction workers, polycarbonate shell, quantity 1000 nos.',
    technicalRequirements: 'Helmets shall protect against falling objects and lateral impact.',
  },
];
