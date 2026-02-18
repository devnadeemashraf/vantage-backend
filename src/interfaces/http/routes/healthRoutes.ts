/**
 * Health Check Route
 * Layer: Interfaces (HTTP)
 *
 * A lightweight endpoint that returns 200 OK when the server is alive:
 *
 *   GET /api/v1/health  →  { status: 'ok', uptime: 123.4, timestamp: '...' }
 *
 * Health checks are used by:
 *   - Load balancers (e.g. AWS ALB) to decide if this instance should
 *     receive traffic. If it returns non-200, traffic is routed elsewhere.
 *   - Docker healthcheck or Kubernetes liveness probes to auto-restart
 *     unhealthy containers.
 *   - Monitoring dashboards to track uptime.
 *
 * This endpoint does NOT check database connectivity — it only confirms
 * the HTTP server process is running. A deeper "/health/ready" endpoint
 * that pings the DB could be added for readiness checks.
 */
import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRoutes };
