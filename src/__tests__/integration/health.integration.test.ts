/**
 * Integration Tests — Health Endpoint
 *
 * Verifies the `GET /api/v1/health` endpoint through the full Express
 * middleware chain (helmet, cors, compression, JSON parser, request logger,
 * and finally the route handler itself) using Supertest.
 *
 * Supertest creates an in-memory HTTP connection to the Express app — no
 * real port is bound, no network traffic leaves the machine. This makes
 * the test fast and free of port-conflict flakiness.
 *
 * The health endpoint is deliberately lightweight: it confirms the HTTP
 * server process is alive and returns uptime + timestamp metadata. It does
 * NOT ping the database, so these tests work without Docker / PostgreSQL.
 */
import { createApp } from '@interfaces/http/app';
import request from 'supertest';

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('should return 200 with status "ok"', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('should include an uptime value (number of seconds)', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should include a valid ISO 8601 timestamp', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.body.timestamp).toBeDefined();
    const parsed = new Date(res.body.timestamp);
    expect(parsed.toISOString()).toBe(res.body.timestamp);
  });

  it('should return JSON content type', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
