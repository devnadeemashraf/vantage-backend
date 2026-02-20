/**
 * Business Repository Interface — Data Access Contract
 * Layer: Domain
 * Pattern: Repository Pattern
 *
 * I define what data operations the app needs (search, findByAbn, bulkUpsert,
 * etc.) without tying the app to a specific database. The domain owns this
 * contract; Infrastructure implements it (e.g. PostgresBusinessRepository).
 * If we ever switched to Elasticsearch, we’d only swap the implementation —
 * callers stay unchanged.
 *
 * Methods are documented inline below.
 */
import type { Business, BusinessRow } from '@domain/entities/Business';
import type { BusinessNameRow } from '@domain/entities/BusinessName';
import type { BusinessLookupResult, PaginatedResult, SearchQuery } from '@shared/types';

export interface IBusinessRepository {
  /** Insert or update businesses in bulk. Returns the number of rows affected. */
  bulkUpsert(rows: BusinessRow[]): Promise<number>;

  /** Insert business names in bulk (trading names, business names, etc.). */
  bulkInsertNames(rows: BusinessNameRow[]): Promise<void>;

  /** Look up a single business by its 11-digit ABN. Includes queryTimeMs for API timing. */
  findByAbn(abn: string): Promise<BusinessLookupResult<Business>>;

  /**
   * Search using native SQL only (e.g. ILIKE, no extensions). Used when
   * technique is 'native' to compare baseline query performance.
   */
  searchNative(query: SearchQuery): Promise<PaginatedResult<Business>>;

  /**
   * Search using optimized path (indexes, tsvector). Used when
   * technique is 'optimized'. Same contract as searchNative; implementation
   * can differ for performance comparison.
   */
  searchOptimized(query: SearchQuery): Promise<PaginatedResult<Business>>;

  /** Filtered listing (state, postcode, entity type, status) with pagination. Includes meta.queryTimeMs. */
  findWithFilters(query: SearchQuery): Promise<PaginatedResult<Business>>;

  /** Retrieve the IDs for a batch of ABNs (used by ETL to link business_names). */
  getIdsByAbns(abns: string[]): Promise<Map<string, number>>;
}
