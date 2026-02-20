/**
 * Search Strategy Factory
 * Layer: Application
 * Pattern: Factory Pattern
 *
 * I map the request’s mode and technique to the right strategy: mode=ai → 501
 * for now; technique=optimized → OptimizedSearchStrategy (index-backed);
 * otherwise NativeSearchStrategy (ILIKE baseline). The factory gets the repo
 * via DI and passes it into whichever strategy it builds per request.
 */
import { NativeSearchStrategy } from '@application/strategies/NativeSearchStrategy';
import { OptimizedSearchStrategy } from '@application/strategies/OptimizedSearchStrategy';
import { TOKENS } from '@core/types';
import type { ISearchStrategy } from '@domain/interfaces/ISearchStrategy';
import { AppError } from '@shared/errors/AppError';
import type { SearchQuery } from '@shared/types';
import { inject, injectable } from 'tsyringe';

@injectable()
export class SearchStrategyFactory {
  constructor(@inject(TOKENS.BusinessRepository) private _repo: unknown) {}

  create(query: SearchQuery): ISearchStrategy {
    if (query.mode === 'ai') {
      throw new AppError('AI search is not yet configured', 501);
    }
    const technique = query.technique ?? 'native';
    switch (technique) {
      case 'optimized':
        return new OptimizedSearchStrategy(
          this._repo as ConstructorParameters<typeof OptimizedSearchStrategy>[0],
        );
      case 'native':
        return new NativeSearchStrategy(
          this._repo as ConstructorParameters<typeof NativeSearchStrategy>[0],
        );
      default:
        throw new AppError(`Unknown search technique: ${technique}`, 400);
    }
  }
}
