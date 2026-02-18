import { inject, injectable } from 'tsyringe';
import { TOKENS } from '@core/types';
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import type { Business } from '@domain/entities/Business';
import type { SearchQuery, PaginatedResult } from '@shared/types';
import { SearchStrategyFactory } from '@application/factories/SearchStrategyFactory';
import { NotFoundError } from '@shared/errors/AppError';

@injectable()
export class SearchService {
  constructor(
    @inject(TOKENS.BusinessRepository) private repo: IBusinessRepository,
    private strategyFactory: SearchStrategyFactory,
  ) {}

  async search(query: SearchQuery): Promise<PaginatedResult<Business>> {
    const strategy = this.strategyFactory.create(query.mode ?? 'standard');
    return strategy.execute(query);
  }

  async findByAbn(abn: string): Promise<Business> {
    const result = await this.repo.findByAbn(abn);
    if (!result) throw new NotFoundError('Business', abn);
    return result;
  }
}
