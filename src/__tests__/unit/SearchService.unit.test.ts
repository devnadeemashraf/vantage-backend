/**
 * Unit Tests — SearchService
 *
 * I test that search() delegates to the factory’s strategy and that
 * findByAbn() returns the repo result or throws NotFoundError. Repo and
 * factory/strategy are mocked so we only assert wiring and behaviour, not
 * the DB.
 */
import { SearchStrategyFactory } from '@application/factories/SearchStrategyFactory';
import { SearchService } from '@application/services/SearchService';
import type { ISearchStrategy } from '@domain/interfaces/ISearchStrategy';
import { NotFoundError } from '@shared/errors/AppError';

import { sampleBusiness, sampleFilterQuery, sampleSearchQuery } from '../helpers/fixtures';
import { createMockRepository, MockBusinessRepository } from '../helpers/mockRepository';

describe('SearchService', () => {
  let service: SearchService;
  let mockRepo: MockBusinessRepository;
  let mockFactory: jest.Mocked<SearchStrategyFactory>;
  let mockStrategy: jest.Mocked<ISearchStrategy>;

  beforeEach(() => {
    mockRepo = createMockRepository();

    mockStrategy = {
      execute: jest.fn(),
    };

    mockFactory = {
      create: jest.fn().mockReturnValue(mockStrategy),
    } as unknown as jest.Mocked<SearchStrategyFactory>;

    service = new SearchService(mockRepo, mockFactory);
  });

  describe('search()', () => {
    const paginatedResult = {
      data: [sampleBusiness],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };

    it('should delegate to the strategy returned by the factory', async () => {
      mockStrategy.execute.mockResolvedValue(paginatedResult);

      const result = await service.search(sampleSearchQuery);

      expect(mockFactory.create).toHaveBeenCalledWith(sampleSearchQuery);
      expect(mockStrategy.execute).toHaveBeenCalledWith(sampleSearchQuery);
      expect(result).toEqual(paginatedResult);
    });

    it('should pass the full query (including technique) to the factory', async () => {
      mockStrategy.execute.mockResolvedValue(paginatedResult);

      await service.search(sampleFilterQuery);

      expect(mockFactory.create).toHaveBeenCalledWith(sampleFilterQuery);
    });

    it('should pass the query when technique is undefined (defaults to native in factory)', async () => {
      const queryNoTechnique = { term: 'test', page: 1, limit: 10 };
      mockStrategy.execute.mockResolvedValue(paginatedResult);

      await service.search(queryNoTechnique);

      expect(mockFactory.create).toHaveBeenCalledWith(queryNoTechnique);
    });

    it('should propagate errors from the strategy', async () => {
      mockStrategy.execute.mockRejectedValue(new Error('DB timeout'));

      await expect(service.search(sampleSearchQuery)).rejects.toThrow('DB timeout');
    });
  });

  describe('findByAbn()', () => {
    it('should return the business and queryTimeMs when found', async () => {
      mockRepo.findByAbn.mockResolvedValue({ business: sampleBusiness, queryTimeMs: 3 });

      const result = await service.findByAbn('53004085616');

      expect(mockRepo.findByAbn).toHaveBeenCalledWith('53004085616');
      expect(result.business).toEqual(sampleBusiness);
      expect(result.queryTimeMs).toBe(3);
    });

    it('should throw NotFoundError when ABN does not exist', async () => {
      mockRepo.findByAbn.mockResolvedValue({ business: null, queryTimeMs: 1 });

      await expect(service.findByAbn('00000000000')).rejects.toThrow(NotFoundError);
      await expect(service.findByAbn('00000000000')).rejects.toThrow(
        'Business not found: 00000000000',
      );
    });
  });
});
