/**
 * Shared Type Definitions
 * Layer: Shared (cross-cutting, used by every layer)
 *
 * These interfaces define the "shapes" of data that flow between layers.
 * They are deliberately placed in `shared/` because they aren't owned by
 * any single layer — a controller creates a SearchQuery, the service passes
 * it through, and the repository consumes it.
 *
 * SearchQuery:
 *   The universal search request object. Contains the user's search term,
 *   optional filters (state, postcode, etc.), pagination params, and a `mode`
 *   discriminator that tells the SearchStrategyFactory which algorithm to use.
 *
 * PaginatedResult<T>:
 *   A generic wrapper that pairs a page of results with pagination metadata.
 *   The `T` generic means we can reuse the same shape for businesses, names,
 *   or any future entity. Every list endpoint returns this consistent shape,
 *   so frontend developers always know what to expect.
 *
 * IngestionResult:
 *   Summary returned after an ETL run — how many records were processed,
 *   how many were new inserts vs updates, and how long it took. Used by
 *   both the HTTP ingestion endpoint and the CLI seed script.
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
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IngestionResult {
  totalProcessed: number;
  totalInserted: number;
  totalUpdated: number;
  durationMs: number;
}
