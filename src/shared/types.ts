/**
 * Shared Type Definitions
 * Layer: Shared (cross-cutting, used by every layer)
 *
 * I keep DTOs and request/response shapes here so no single layer owns them.
 * SearchQuery is built by the controller and passed through the service to
 * the repo; it carries term, filters, pagination, and mode/technique for the
 * strategy factory. PaginatedResult<T> is the standard list response shape.
 * IngestionResult is what the ETL worker returns (counts, duration) for both
 * the HTTP ingest endpoint and the seed script.
 */
export interface SearchQuery {
  term?: string;
  abn?: string;
  state?: string;
  postcode?: string;
  entityType?: string;
  abnStatus?: string;
  page: number;
  limit: number;
  mode?: 'standard' | 'ai';
  technique?: 'native' | 'optimized';
}

/**
 * Timing metadata returned with search and lookup responses.
 * Enables the client to display total request time vs database query time.
 */
export interface SearchResultMeta {
  /** Wall-clock time from request arrival to response sent (ms). */
  totalTimeMs?: number;
  /** Time spent executing database queries (ms). */
  queryTimeMs?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  /** Optional timing metadata (added by repository and controller). */
  meta?: SearchResultMeta;
}

/** Result shape for single-business lookup with DB timing. */
export interface BusinessLookupResult<T = unknown> {
  business: T | null;
  queryTimeMs: number;
}

export interface IngestionResult {
  totalProcessed: number;
  totalInserted: number;
  totalUpdated: number;
  durationMs: number;
}
