/**
 * Wire types for the applicability engine.
 *
 * These mirror `backend/app/schemas/applicability.py` exactly. The single
 * `POST /api/applicability/analyze` call returns everything the guided workflow
 * needs, so these types cover one request/response pair plus the review calls.
 */

export type ApplicabilityStatus =
  | 'APPLICABLE'
  | 'CONDITIONALLY_APPLICABLE'
  | 'EXCLUDED'
  | 'SUPERSEDED'
  | 'CONFLICTING'
  | 'UNDETERMINED';

/** Order used for the summary counts, most actionable first. */
export const STATUS_ORDER: ApplicabilityStatus[] = [
  'APPLICABLE',
  'CONDITIONALLY_APPLICABLE',
  'EXCLUDED',
  'CONFLICTING',
  'SUPERSEDED',
  'UNDETERMINED',
];

export type CheckResult = 'match' | 'mismatch' | 'missing' | 'excluded';

export interface RequirementField {
  key: string;
  label: string;
  value: string | null;
  numeric: number | null;
  unit: string | null;
  source: 'extracted' | 'user' | 'derived';
  confidence: number;
  critical: boolean;
  missing: boolean;
}

export interface CheckRow {
  dimension: string;
  label: string;
  requirement_value: string | null;
  standard_condition: string;
  clause: string | null;
  critical: boolean;
  condition_text?: string | null;
  operator?: string | null;
  result: CheckResult;
  detail?: string | null;
  reason?: string | null;
  note?: string | null;
}

export interface VersionRow {
  edition: string;
  status: string;
  year: number | null;
  note: string | null;
}

export interface RelatedRow {
  edition: string;
  title: string;
  relationship: string;
}

export interface EvidenceRow {
  clause: string;
  text: string;
  supports?: string | null;
}

export interface MissingQuestion {
  dimension: string;
  label: string;
  clause: string | null;
  condition_text: string | null;
}

export interface Assessment {
  standard_id: string;
  is_number: string;
  edition: string;
  title: string;
  status: ApplicabilityStatus;
  status_label: string;
  record_status: string;
  record_status_label: string;
  scope: string;
  sector: string;
  category: string;
  year: number | null;
  why_selected: string[];
  retrieval_score: number;
  semantic_score: number;
  keyword_score: number;
  checks: CheckRow[];
  matched_count: number;
  missing_critical: string[];
  missing_optional: string[];
  conflicting: string[];
  excluded_by: string[];
  reason: string;
  why_not_applicable: string;
  conditional_note: string;
  versions: VersionRow[];
  related: RelatedRow[];
  evidence: EvidenceRow[];
  missing_questions: MissingQuestion[];
  conditions_total: number;
}

export interface Clarification {
  dimension: string;
  label: string;
  question: string;
  options: string[];
  affected_standards: string[];
  why: string;
}

export interface KnowledgeBaseInfo {
  label: string;
  notice: string;
  kb_version: string;
  size: number;
  source_file?: string | null;
  database?: string | null;
  sqlite_rows?: number | null;
}

export interface AnalysisResult {
  ui_message: string;
  knowledge_base: KnowledgeBaseInfo;
  specification: string;
  product_name: string;
  requirements: Record<string, RequirementField>;
  fields: RequirementField[];
  candidates: Assessment[];
  summary: Record<string, number>;
  clarifications: Clarification[];
  processing_ms: number;
  disclaimer: string;
  created_at: string;
}

export interface AnalyzeRequest {
  specification: string;
  product_name?: string | null;
  technical_requirements?: string | null;
  file_text?: string | null;
  requirements?: Record<string, string> | null;
  stage?: 'analyze' | 'recheck';
}

export interface UploadResponse {
  filename: string;
  content_type: string;
  chars: number;
  pages: number | null;
  truncated: boolean;
  text: string;
  message: string;
}

export type Decision = 'accepted' | 'rejected' | 'modified';

export interface ReviewCreate {
  standard_id: string;
  is_number: string;
  edition: string;
  reported_status: string;
  decision: Decision;
  note?: string | null;
  specification?: string;
  requirements?: Record<string, string>;
  user_id?: string | null;
}

export interface OfficerReview {
  id: number;
  created_at: string;
  user_id: string | null;
  specification: string;
  requirements: Record<string, unknown>;
  kb_id: string;
  is_number: string;
  edition: string;
  reported_status: string;
  decision: Decision;
  note: string | null;
}
