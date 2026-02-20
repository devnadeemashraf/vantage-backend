/**
 * Search Strategy Factory
 * Layer: Application
 * Pattern: Factory Pattern
 *
 * The Factory Pattern is like a **vending machine**: you press a button
 * (pass a `mode` string), and it dispenses the right product (strategy
 * instance) without you needing to know how it was built.
 *
 * This factory is the single place that maps mode -> strategy:
 *   'standard' -> StandardSearchStrategy (PostgreSQL full-text + fuzzy)
 *   'ai'       -> AiSearchStrategy       (not yet implemented, throws 501)
 *
 * Open/Closed Principle:
 *   To add a new search mode, you add a new `case` here and a new strategy
 *   class — you never modify the existing StandardSearchStrategy or the
 *   SearchService. The existing code is "closed" to modification but "open"
 *   to extension.
 *
 * The factory receives the repository via DI (@inject) and passes it to
 * whichever strategy it constructs, keeping strategies stateless and testable.
 */
import { StandardSearchStrategy } from '@application/strategies/StandardSearchStrategy';
import { TOKENS } from '@core/types';
import type { ISearchStrategy } from '@domain/interfaces/ISearchStrategy';
import { AppError } from '@shared/errors/AppError';
import { inject, injectable } from 'tsyringe';

@injectable()
export class SearchStrategyFactory {
  constructor(@inject(TOKENS.BusinessRepository) private _repo: unknown) {}

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
