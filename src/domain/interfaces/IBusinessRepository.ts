import type { Business, BusinessRow } from '@domain/entities/Business';
import type { BusinessNameRow } from '@domain/entities/BusinessName';
import type { SearchQuery, PaginatedResult } from '@shared/types';

export interface IBusinessRepository {
  /** Insert or update businesses in bulk. Returns the number of rows affected. */
  bulkUpsert(rows: BusinessRow[]): Promise<number>;

  /** Insert business names in bulk (trading names, business names, etc.). */
  bulkInsertNames(rows: BusinessNameRow[]): Promise<void>;

  /** Look up a single business by its 11-digit ABN. */
  findByAbn(abn: string): Promise<Business | null>;

  /** Full-text + fuzzy search combining tsvector and pg_trgm. */
  search(query: SearchQuery): Promise<PaginatedResult<Business>>;

  /** Filtered listing (state, postcode, entity type, status) with pagination. */
  findWithFilters(query: SearchQuery): Promise<PaginatedResult<Business>>;

  /** Retrieve the IDs for a batch of ABNs (used by ETL to link business_names). */
  getIdsByAbns(abns: string[]): Promise<Map<string, number>>;
}
