/**
 * Integration Tests — Business Search & ABN Lookup Endpoints
 *
 * Tests the full HTTP request lifecycle for business-related endpoints:
 *
 *   GET /api/v1/businesses/search?q=...  — paginated search
 *   GET /api/v1/businesses/:abn          — single ABN lookup
 *
 * Strategy:
 *   These tests exercise the real Express middleware chain, real controllers,
 *   and real service layer — but the IBusinessRepository is swapped out for
 *   a mock via the DI container. This verifies that all the layers are wired
 *   together correctly (route → controller → service → repository interface)
 *   without requiring a running PostgreSQL instance.
 *
 *   The mock repository is configured in `beforeAll` so every test starts
 *   with predictable return values. The DI container's `register()` method
 *   is called with `{ useValue: mockRepo }` which overrides the real
 *   PostgresBusinessRepository registration for the duration of the test.
 *
 *   IMPORTANT: The app must be created INSIDE `beforeAll`, AFTER the
 *   container override. Module-level code runs before lifecycle hooks,
 *   so creating the app at the top level would resolve the real repository
 *   from the container before the mock is registered.
 *
 * Why not test against a real database here?
 *   Real DB tests are valuable but belong in a dedicated E2E suite that runs
 *   separately (e.g. in CI with a Dockerised PostgreSQL). These integration
 *   tests focus on the HTTP contract: correct status codes, response shapes,
 *   header values, and error formatting — all verifiable without a DB.
 */
import { TOKENS } from '@core/types';
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import type { Express } from 'express';
import request from 'supertest';
import { container } from 'tsyringe';

import { sampleBusiness } from '../helpers/fixtures';
import { createMockRepository, MockBusinessRepository } from '../helpers/mockRepository';

let app: Express;
let mockRepo: MockBusinessRepository;

/**
 * Override the DI container's BusinessRepository with a mock.
 *
 * Ordering matters here because tsyringe resolves the LAST registration:
 *   1. Import @core/container — this triggers the real registrations
 *      (PostgresBusinessRepository, SearchService, etc.).
 *   2. Override TOKENS.BusinessRepository with our mock — now it's the
 *      last registration and wins on resolve().
 *   3. Import and call createApp() — the side-effect `import '@core/container'`
 *      in app.ts is a cache hit (no-op), so our mock stays on top.
 *      businessRoutes.ts then creates BusinessController which resolves
 *      SearchService → SearchStrategyFactory → both get the mock repo.
 */
beforeAll(async () => {
  await import('@core/container');

  mockRepo = createMockRepository();
  container.register<IBusinessRepository>(TOKENS.BusinessRepository, {
    useValue: mockRepo as unknown as IBusinessRepository,
  });

  const { createApp } = await import('@interfaces/http/app');
  app = createApp();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/v1/businesses/search', () => {
  it('should return 200 with paginated results', async () => {
    mockRepo.search.mockResolvedValue({
      data: [sampleBusiness],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const res = await request(app).get('/api/v1/businesses/search?q=vantage');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].abn).toBe('53004085616');
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('should return an empty paginated array when no results match', async () => {
    mockRepo.search.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const res = await request(app).get('/api/v1/businesses/search?q=xyznonexistent');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('should use findWithFilters when no search term is provided', async () => {
    mockRepo.findWithFilters.mockResolvedValue({
      data: [sampleBusiness],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const res = await request(app).get('/api/v1/businesses/search?state=NSW');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('should respect page and limit query params', async () => {
    mockRepo.search.mockResolvedValue({
      data: [],
      pagination: { page: 2, limit: 5, total: 50, totalPages: 10 },
    });

    const res = await request(app).get('/api/v1/businesses/search?q=test&page=2&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(5);
  });

  it('should return JSON content type', async () => {
    mockRepo.search.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const res = await request(app).get('/api/v1/businesses/search?q=test');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('GET /api/v1/businesses/:abn', () => {
  it('should return 200 with the business when ABN exists', async () => {
    mockRepo.findByAbn.mockResolvedValue(sampleBusiness);

    const res = await request(app).get('/api/v1/businesses/53004085616');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.abn).toBe('53004085616');
    expect(res.body.data.entityName).toBe('VANTAGE SEARCH PTY LTD');
  });

  it('should return 404 when ABN does not exist', async () => {
    mockRepo.findByAbn.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/businesses/00000000000');

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('not found');
  });
});
