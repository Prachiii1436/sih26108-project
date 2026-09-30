/** Wire types for the SIH26108 applicability demonstrator (Steps 1-10). */

export type ApplicabilityStatus =
  | 'APPLICABLE'
  | 'CONDITIONALLY_APPLICABLE'
  | 'EXCLUDED'
  | 'SUPERSEDED'
  | 'CONFLICTING'
  | 'UNDETERMINED';

export const STATUS_ORDER: ApplicabilityStatus[] = [
  'APPLICABLE',
  'CONDITIONALLY_APPLICABLE',
  'EXCLUDED',
  'SUPERSEDED',
  'CONFLICTING',
  'UNDETERMINED',
];

export const STATUS_LABEL: Record<ApplicabilityStatus, string> = {
  APPLICABLE: 'Applicable',
  CONDITIONALLY_APPLICABLE: 'Conditionally Applicable',
  EXCLUDED: 'Excluded',
  SUPERSEDED: 'Superseded',
  CONFLICTING: 'Conflicting',
  UNDETERMINED: 'Undetermined',
};

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

export type CheckResult = 'match' | 'mismatch' | 'missing' | 'excluded';

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
  missing_questions: { dimension: string; label: string; clause: string | null; condition_text: string | null }[];
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

export interface PipelineStage {
  key: string;
  label: string;
  status: string;
  detail?: string | null;
  duration_ms?: number | null;
}

export interface ApplicabilityResponse {
  ui_message: string;
  knowledge_base: KnowledgeBaseInfo;
  specification: string;
  product_name: string;
  requirements: Record<string, RequirementField>;
  fields: RequirementField[];
  candidates: Assessment[];
  summary: Record<string, number>;
  clarifications: Clarification[];
  pipeline: PipelineStage[];
  processing_ms: number;
  disclaimer: string;
  created_at: string;
}

export interface ApplicabilityAnalyzeRequest {
  specification: string;
  product_name?: string | null;
  technical_requirements?: string | null;
  file_text?: string | null;
  requirements?: Record<string, string> | null;
  top_k?: number | null;
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

export interface KnowledgeBaseResponse {
  knowledge_base: KnowledgeBaseInfo;
  notice: string;
  disclaimer: string;
  ui_message: string;
  standards: {
    id: string;
    is_number: string;
    edition: string;
    title: string;
    status: string;
    status_label: string;
    sector: string;
    category: string;
    product_family: string;
    product_types: string[];
    scope: string;
    year: number | null;
    conditions: { dimension: string; label: string; clause: string | null; critical: boolean; text: string | null }[];
    exclusions: { dimension: string; not_allowed: string[]; clause: string; reason: string; note?: string }[];
    versions: VersionRow[];
    related: RelatedRow[];
    evidence: EvidenceRow[];
  }[];
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
  decision: 'accepted' | 'rejected' | 'modified';
  note: string | null;
}

export interface ReviewCreate {
  standard_id: string;
  is_number: string;
  edition: string;
  reported_status: string;
  decision: 'accepted' | 'rejected' | 'modified';
  note?: string | null;
  specification?: string;
  requirements?: Record<string, string>;
}
