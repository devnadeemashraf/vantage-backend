/**
 * Search Service — The Orchestrator
 * Layer: Application
 * Pattern: Facade (simplifies access to the search subsystem)
 *
 * Think of this as the **receptionist at a doctor's office**: a patient (HTTP
 * request) walks in and says "I need to find a business." The receptionist
 * doesn't perform the search herself — she checks the mode, picks the right
 * specialist (strategy), and sends the patient there.
 *
 * This service has two responsibilities:
 *   1. search(): Resolves the correct strategy via SearchStrategyFactory,
 *      then delegates the search to it. The controller never knows (or cares)
 *      which algorithm ran.
 *   2. findByAbn(): Direct ABN lookup that bypasses strategies entirely —
 *      it's always a simple primary-key fetch, no algorithm choice needed.
 *      Throws NotFoundError (404) if the ABN doesn't exist.
 *
 * The service is @injectable so the DI container wires it up automatically;
 * controllers resolve it via TOKENS.SearchService.
 */
import { SearchStrategyFactory } from '@application/factories/SearchStrategyFactory';
import { TOKENS } from '@core/types';
import type { Business } from '@domain/entities/Business';
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import { NotFoundError } from '@shared/errors/AppError';
import type { PaginatedResult, SearchQuery } from '@shared/types';
import { inject, injectable } from 'tsyringe';

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
