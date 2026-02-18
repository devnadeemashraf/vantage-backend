/**
 * Standard Search Strategy — Full-Text + Fuzzy via PostgreSQL
 * Layer: Application
 * Pattern: Strategy Pattern (implements ISearchStrategy)
 *
 * This is the "default algorithm" for search. It delegates entirely to the
 * repository layer which uses PostgreSQL's tsvector + pg_trgm under the hood.
 *
 * The Strategy Pattern works like a **switchboard**: the SearchService doesn't
 * call the repository directly — it asks the factory for a strategy, and the
 * strategy decides what to do. This class is one of the plugs on that board.
 *
 * Decision logic:
 *   - If the user provided a search term (`query.term`), run full-text + fuzzy
 *     search via `repo.search()`.
 *   - If no term was provided, just apply filters (state, postcode, etc.)
 *     via `repo.findWithFilters()`.
 *
 * When the AI strategy is added later, it will implement the same
 * ISearchStrategy interface but translate natural language to SQL instead.
 */
import { TOKENS } from '@core/types';
import type { Business } from '@domain/entities/Business';
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import type { ISearchStrategy } from '@domain/interfaces/ISearchStrategy';
import type { PaginatedResult, SearchQuery } from '@shared/types';
import { inject, injectable } from 'tsyringe';

@injectable()
export class StandardSearchStrategy implements ISearchStrategy {
  constructor(@inject(TOKENS.BusinessRepository) private repo: IBusinessRepository) {}

  async execute(query: SearchQuery): Promise<PaginatedResult<Business>> {
    if (query.term) {
      return this.repo.search(query);
    }
    return this.repo.findWithFilters(query);
  }
}
