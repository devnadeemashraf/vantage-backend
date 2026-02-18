import { inject, injectable } from 'tsyringe';
import { TOKENS } from '@core/types';
import type { ISearchStrategy } from '@domain/interfaces/ISearchStrategy';
import { StandardSearchStrategy } from '@application/strategies/StandardSearchStrategy';
import { AppError } from '@shared/errors/AppError';

/**
 * Factory that returns the correct ISearchStrategy based on mode.
 * Currently only 'standard' is available. When an AI engine is wired
 * in (Commit 10), the factory will resolve AiSearchStrategy from the
 * DI container for mode='ai'.
 */
@injectable()
export class SearchStrategyFactory {
  constructor(
    @inject(TOKENS.BusinessRepository) private _repo: unknown,
  ) {}

  create(mode: 'standard' | 'ai' = 'standard'): ISearchStrategy {
    switch (mode) {
      case 'standard':
        return new StandardSearchStrategy(
          this._repo as ConstructorParameters<typeof StandardSearchStrategy>[0],
        );
      case 'ai':
        throw new AppError('AI search is not yet configured', 501);
      default:
        throw new AppError(`Unknown search mode: ${mode}`, 400);
    }
  }
}
