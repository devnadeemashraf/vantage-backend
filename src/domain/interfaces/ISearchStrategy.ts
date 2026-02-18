import type { Business } from '@domain/entities/Business';
import type { SearchQuery, PaginatedResult } from '@shared/types';

export interface ISearchStrategy {
  execute(query: SearchQuery): Promise<PaginatedResult<Business>>;
}
