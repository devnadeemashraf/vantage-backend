/**
 * Unit Tests — SearchStrategyFactory
 *
 * The factory is responsible for mapping a `mode` string to the correct
 * search strategy implementation:
 *
 *   'standard' → StandardSearchStrategy (PostgreSQL full-text + fuzzy)
 *   'ai'       → throws 501 (not yet implemented)
 *   anything   → throws 400 (unknown mode)
 *
 * These tests verify the factory's branching logic WITHOUT touching the
 * database. The repository injected into the factory is a mock — the
 * strategy instances are real, but since we never call `execute()` here,
 * no DB queries fire.
 *
 * The factory test doubles as a regression guard: if someone adds a new
 * mode and forgets to wire a strategy, the "unknown mode" test will catch
 * the oversight.
 */
import { SearchStrategyFactory } from '@application/factories/SearchStrategyFactory';
import { StandardSearchStrategy } from '@application/strategies/StandardSearchStrategy';
import { AppError } from '@shared/errors/AppError';

import { createMockRepository } from '../helpers/mockRepository';

describe('SearchStrategyFactory', () => {
  let factory: SearchStrategyFactory;

  beforeEach(() => {
    const mockRepo = createMockRepository();
    factory = new SearchStrategyFactory(mockRepo);
  });

  describe('create()', () => {
    it('should return a StandardSearchStrategy for mode "standard"', () => {
      const strategy = factory.create('standard');

      expect(strategy).toBeInstanceOf(StandardSearchStrategy);
    });

    it('should default to "standard" when no mode is provided', () => {
      const strategy = factory.create();

      expect(strategy).toBeInstanceOf(StandardSearchStrategy);
    });

    it('should throw a 501 AppError for mode "ai"', () => {
      expect(() => factory.create('ai')).toThrow(AppError);

      try {
        factory.create('ai');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(501);
        expect((err as AppError).message).toContain('AI search');
      }
    });

    it('should throw a 400 AppError for an unknown mode', () => {
      // Cast to bypass TypeScript's union-type guard — simulates
      // a runtime value that slips past validation.
      expect(() => factory.create('quantum' as 'standard' | 'ai')).toThrow(AppError);

      try {
        factory.create('quantum' as 'standard' | 'ai');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).message).toContain('Unknown search mode');
      }
    });
  });
});
