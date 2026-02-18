import { inject, injectable } from 'tsyringe';
import { TOKENS } from '@core/types';
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import type { ISearchStrategy } from '@domain/interfaces/ISearchStrategy';
import type { Business } from '@domain/entities/Business';
import type { SearchQuery, PaginatedResult } from '@shared/types';

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
