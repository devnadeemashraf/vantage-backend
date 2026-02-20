/**
 * Business Repository Interface — The Data Access Contract
 * Layer: Domain
 * Pattern: Repository Pattern
 *
 * This interface defines WHAT data operations the app needs, without saying
 * HOW they are performed. Think of it as a **menu at a restaurant**: it lists
 * every dish (operation) you can order, but says nothing about the kitchen
 * (database engine) that prepares them.
 *
 * Why does the Domain layer own this interface?
 *   This is the core principle of Clean Architecture's Dependency Rule:
 *   inner layers define contracts, outer layers implement them.
 *   The domain says "I need a way to search businesses" — the infrastructure
 *   layer (PostgresBusinessRepository) decides to use PostgreSQL with GIN
 *   indexes to fulfil that contract. If we migrated to Elasticsearch tomorrow,
 *   only the implementation changes; every consumer of this interface stays
 *   untouched.
 *
 * Each method is documented inline below with its purpose.
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

  /** Full-text + fuzzy search combining tsvector and pg_trgm. Includes meta.queryTimeMs. */
  search(query: SearchQuery): Promise<PaginatedResult<Business>>;

  /** Filtered listing (state, postcode, entity type, status) with pagination. Includes meta.queryTimeMs. */
  findWithFilters(query: SearchQuery): Promise<PaginatedResult<Business>>;

  /** Retrieve the IDs for a batch of ABNs (used by ETL to link business_names). */
  getIdsByAbns(abns: string[]): Promise<Map<string, number>>;
}
