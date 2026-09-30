/**
 * The only three backend calls the workflow makes.
 *
 *   POST /api/applicability/analyze  - extract, find candidates, check, explain
 *   POST /api/applicability/upload   - read a PDF / DOCX / TXT tender document
 *   POST /api/applicability/review   - record the officer's decision
 */
import { http, request } from './api';

import type { AnalysisResult, AnalyzeRequest, OfficerReview, ReviewCreate, UploadResponse } from './types';

/**
 * One call drives the whole guided workflow.
 *
 * The response already contains the extracted requirements, the candidate
 * standards and the completed applicability check, so the five UI steps read
 * different slices of the same object instead of re-querying the server.
 *
 * `requirements` carries officer edits and clarification answers; it always wins
 * over what the parser read from the text, which is exactly what the re-check
 * step needs.
 */
export const runAnalysis = (payload: AnalyzeRequest) =>
  request<AnalysisResult>(() => http.post('/applicability/analyze', payload));

/** Read the text of an uploaded tender / specification document. */
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

/** Record one accept / reject / modify decision. */
export const submitReview = (payload: ReviewCreate) =>
  request<OfficerReview>(() => http.post('/applicability/review', payload));

/** ------------------------------------------------------------------ demos */

export interface DemoExample {
  id: string;
  label: string;
  description: string;
  productName: string;
  specification: string;
  technicalRequirements: string;
}

/**
 * Ready-made requirements so a live demo never depends on typing.
 *
 * `water-heater` is the one to use on camera: it produces applicable,
 * conditional, excluded, conflicting, superseded and undetermined results in a
 * single pass, and raises a clarification question.
 */
export const DEMO_EXAMPLES: DemoExample[] = [
  {
    id: 'water-heater',
    label: 'Water heater for a hostel',
    description: 'Shows every result type, plus a question the system must ask you.',
    productName: 'Electric Water Heater',
    specification:
      'Electric water heater, 1000 litre capacity, 230 V single phase supply, for a hostel mess.',
    technicalRequirements:
      'Storage type heater with ISI mark. Must comply with applicable safety requirements.',
  },
  {
    id: 'water-heater-unclear',
    label: 'Water heater, use not stated',
    description: 'Omits the application, so the system has to ask before it can decide.',
    productName: 'Electric Water Heater',
    specification: 'Electric water heater, 1000 litre capacity, 230 V single phase supply.',
    technicalRequirements: 'Storage type heater with ISI mark for a residential block.',
  },
  {
    id: 'safety-helmets',
    label: 'Safety helmets for site work',
    description: 'A second product family, with an excluded and a superseded edition.',
    productName: 'Safety Helmet',
    specification:
      'Safety helmets for construction workers, polycarbonate shell, quantity 1000 nos.',
    technicalRequirements:
      'Helmets shall protect against falling objects and lateral impact.',
  },
];
