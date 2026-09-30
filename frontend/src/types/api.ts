/**
 * TypeScript mirrors of the FastAPI Pydantic schemas (backend/app/schemas).
 * Keep in sync with the backend contract - the API is the source of truth.
 */

/* ------------------------------------------------------------------ shared */

export interface ApiErrorEnvelope {
  error_code: string;
  message: string;
  details?: Record<string, unknown> | null;
  path?: string | null;
  timestamp?: string | null;
}

export interface PipelineStage {
  key: string;
  label: string;
  status: string;
  detail?: string | null;
  duration_ms?: number | null;
}

export interface PageMeta {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

/* -------------------------------------------------------------- standards */

export interface StandardSummary {
  id: number;
  is_number: string;
  title: string;
  sector: string;
  category: string;
  product?: string | null;
  year?: number | null;
  status: string;
  is_demonstration: boolean;
  source?: string | null;
  source_url?: string | null;
}

export interface StandardKeyword {
  id: number;
  keyword: string;
  weight: number;
}

export interface StandardRequirement {
  id: number;
  requirement_code?: string | null;
  requirement_text: string;
  requirement_type: string;
  is_mandatory: boolean;
  notes?: string | null;
}

export interface StandardDetail extends StandardSummary {
  scope?: string | null;
  description?: string | null;
  keywords: string[];
  requirements: string[];
  revision?: string | null;
  replacement_code?: string | null;
  keyword_rows: StandardKeyword[];
  requirement_rows: StandardRequirement[];
  related_standards: StandardSummary[];
  saved: boolean;
  recommendation_count: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StandardFacets {
  sectors: string[];
  categories: string[];
  statuses: string[];
  years: number[];
  total: number;
}

export interface StandardListResponse {
  items: StandardSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  facets: Record<string, unknown>;
}

export type StandardSort =
  | 'relevance'
  | 'is_number_asc'
  | 'is_number_desc'
  | 'title_asc'
  | 'year_desc'
  | 'year_asc'
  | 'sector_asc'
  | 'updated_desc';

export interface StandardQuery {
  search?: string;
  sector?: string[];
  category?: string[];
  status?: string[];
  year_min?: number;
  year_max?: number;
  product?: string;
  keyword?: string;
  sort?: StandardSort;
  page?: number;
  page_size?: number;
}

export interface CompareRow {
  field: string;
  label: string;
  values: (string | null)[];
}

export interface SimilarityPair {
  a_id: number;
  b_id: number;
  a_is_number: string;
  b_is_number: string;
  similarity: number;
}

export interface CompareResponse {
  standards: StandardDetail[];
  rows: CompareRow[];
  query_id?: number | null;
  pairwise_similarity: SimilarityPair[];
  summary?: string | null;
}

/* --------------------------------------------------------------- analysis */

export interface ExtractedRequirements {
  product?: string | null;
  material?: string | null;
  application?: string | null;
  sector?: string | null;
  category?: string | null;
  quantity?: string | null;
  requirements: string[];
  technical_requirements: string[];
  safety_requirements: string[];
  performance_requirements: string[];
  parameters: Record<string, unknown>;
  keywords: string[];
  confidence: number;
  source: 'nlp' | 'manual' | 'hybrid';
  notes: string[];
}

export interface MatchFactor {
  key: string;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  detail?: string | null;
}

export interface MatchEvidence {
  matched_requirements: string[];
  matched_keywords: string[];
  strengths: string[];
  gaps: string[];
}

export interface Recommendation {
  id?: number | null;
  query_id?: number | null;
  rank: number;
  match_score: number;
  relevance_label: string;
  semantic_score: number;
  keyword_score: number;
  product_score: number;
  sector_score: number;
  requirement_score: number;
  application_score: number;
  reason: string;
  factors: MatchFactor[];
  evidence?: MatchEvidence | null;
  standard: StandardSummary;
}

export interface AnalyzeRequest {
  specification: string;
  product_category?: string | null;
  sector?: string | null;
  quantity?: string | null;
  technical_requirements?: string | null;
  material?: string | null;
  application?: string | null;
  additional_requirements?: string | null;
  top_k?: number | null;
  use_extraction?: boolean;
  persist?: boolean;
}

export interface AnalyzeResponse {
  query_id: number;
  specification: string;
  extraction: ExtractedRequirements;
  recommendations: Recommendation[];
  total_candidates: number;
  knowledge_base_size: number;
  pipeline: PipelineStage[];
  processing_ms: number;
  top_is_number?: string | null;
  top_match_score?: number | null;
  no_match_message?: string | null;
  disclaimer: string;
  created_at: string;
}

export interface RecommendationRequest {
  query_id: number;
  top_k?: number | null;
  overrides?: Partial<ExtractedRequirements> | null;
}

export interface RecommendationResponse {
  query_id: number;
  specification: string;
  extraction: ExtractedRequirements;
  recommendations: Recommendation[];
  weights: Record<string, number>;
  processing_ms: number;
  no_match_message?: string | null;
  disclaimer: string;
}

export interface ExtractResponse {
  extraction: ExtractedRequirements;
  pipeline: PipelineStage[];
  min_relevance: number;
}

/* ---------------------------------------------------------------- history */

export interface SearchHistoryItem {
  id: number;
  specification: string;
  product_category?: string | null;
  sector?: string | null;
  quantity?: string | null;
  technical_requirements?: string | null;
  material?: string | null;
  application?: string | null;
  additional_requirements?: string | null;
  extracted_product?: string | null;
  extracted_material?: string | null;
  extracted_application?: string | null;
  extracted_sector?: string | null;
  extracted_requirements: string[];
  extraction_confidence: number;
  status: string;
  recommendation_count: number;
  top_is_number?: string | null;
  top_match_score?: number | null;
  processing_ms?: number | null;
  created_at: string;
  recommendations: Recommendation[];
}

export interface SearchHistoryListResponse {
  items: SearchHistoryItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  search?: string | null;
  sector?: string | null;
}

export interface SearchHistoryCreate {
  specification: string;
  product_category?: string | null;
  sector?: string | null;
  quantity?: string | null;
  extracted_product?: string | null;
  extracted_sector?: string | null;
  recommendation_count?: number;
  top_is_number?: string | null;
  top_match_score?: number | null;
  status?: 'analyzed' | 'partial' | 'failed';
}

/* ------------------------------------------------------- saved standards */

export interface SavedStandardItem {
  id: number;
  standard_id: number;
  query_id?: number | null;
  notes?: string | null;
  tag?: string | null;
  saved_at: string;
  standard: StandardSummary;
  query_specification?: string | null;
}

export interface SavedStandardCreate {
  standard_id: number;
  query_id?: number | null;
  notes?: string | null;
  tag?: string | null;
}

export interface SavedStandardUpdate {
  notes?: string | null;
  tag?: string | null;
}

/* -------------------------------------------------------------- analytics */

export interface AnalyticsSummary {
  total_queries: number;
  total_standards: number;
  total_recommendations: number;
  total_saved_standards: number;
  average_match_score: number;
  average_extraction_confidence: number;
  average_processing_ms: number;
  queries_last_7_days: number;
  active_sectors: number;
  knowledge_base_demonstration_records: number;
  vector_index_size: number;
  vector_backend: string;
  embedding_model: string;
}

export interface AnalyticsBucket {
  [key: string]: string | number | null;
}

export interface AnalyticsResponse {
  summary: AnalyticsSummary;
  queries_by_sector: AnalyticsBucket[];
  top_products: AnalyticsBucket[];
  score_distribution: AnalyticsBucket[];
  queries_by_day: AnalyticsBucket[];
  top_recommended_standards: AnalyticsBucket[];
  sector_share: AnalyticsBucket[];
  generated_at: string;
}

/* ----------------------------------------------------------------- health */

export interface HealthResponse {
  status: string;
  app: string;
  version: string;
  environment: string;
  timestamp: string;
  database: Record<string, unknown>;
  engine: Record<string, unknown>;
  configuration: Record<string, unknown>;
  disclaimer: string;
}
