/**
 * Native Search Strategy — ILIKE-only baseline
 * Layer: Application
 * Pattern: Strategy Pattern (implements ISearchStrategy)
 *
 * I use this when technique=native: it calls the repo’s searchNative() (plain
 * ILIKE on entity_name, capped pagination). If there’s no search term we
 * delegate to findWithFilters() for filter-only listing.
 */
import { TOKENS } from '@core/types';
import type { Business } from '@domain/entities/Business';
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import type { ISearchStrategy } from '@domain/interfaces/ISearchStrategy';
import type { PaginatedResult, SearchQuery } from '@shared/types';
import { inject, injectable } from 'tsyringe';

@injectable()
export class NativeSearchStrategy implements ISearchStrategy {
  constructor(@inject(TOKENS.BusinessRepository) private repo: IBusinessRepository) {}

  async execute(query: SearchQuery): Promise<PaginatedResult<Business>> {
    if (query.term?.trim()) {
      return this.repo.searchNative(query);
    }
    return this.repo.findWithFilters(query);
  }
}
