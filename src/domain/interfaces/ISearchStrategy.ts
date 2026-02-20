/**
 * Search Strategy Interface
 * Layer: Domain
 * Pattern: Strategy Pattern
 *
 * I use this so we can swap search algorithms (native vs optimized, and later
 * AI) without changing the code that calls them. The factory picks the strategy
 * from the request’s `technique` (and `mode` for AI); the service just calls
 * execute(query). Right now we have NativeSearchStrategy (ILIKE baseline) and
 * OptimizedSearchStrategy (index-backed); mode=ai returns 501 until we wire
 * in a real engine.
 */
import type { Business } from '@domain/entities/Business';
import type { PaginatedResult, SearchQuery } from '@shared/types';

export interface ISearchStrategy {
  execute(query: SearchQuery): Promise<PaginatedResult<Business>>;
}
