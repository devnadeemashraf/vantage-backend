/**
 * Optimized Search Strategy — Index-backed search
 * Layer: Application
 * Pattern: Strategy Pattern (implements ISearchStrategy)
 *
 * I use this when technique=optimized: it calls the repo’s searchOptimized()
 * (GIN/tsvector full-text search from migration 003). No search term →
 * findWithFilters() for filter-only listing.
 */
import { TOKENS } from '@core/types';
import type { Business } from '@domain/entities/Business';
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import type { ISearchStrategy } from '@domain/interfaces/ISearchStrategy';
import type { PaginatedResult, SearchQuery } from '@shared/types';
import { inject, injectable } from 'tsyringe';

@injectable()
export class OptimizedSearchStrategy implements ISearchStrategy {
  constructor(@inject(TOKENS.BusinessRepository) private repo: IBusinessRepository) {}

  async execute(query: SearchQuery): Promise<PaginatedResult<Business>> {
    if (query.term?.trim()) {
      return this.repo.searchOptimized(query);
    }
    return this.repo.findWithFilters(query);
  }
}
