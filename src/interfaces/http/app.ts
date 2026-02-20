/**
 * Express Application Factory
 * Layer: Interfaces (HTTP)
 * Pattern: Factory Function
 *
 * This function assembles the Express application by wiring together
 * middleware and routes. It's a factory (returns a new app instance)
 * rather than a singleton, which is important for two reasons:
 *
 *   1. Clustering: Each cluster worker process calls createApp() to get
 *      its own independent Express instance.
 *   2. Testing: Integration tests can call createApp() to get a fresh app
 *      for each test without shared state leaking between tests.
 *
 * Middleware ordering matters — it's an assembly line:
 *   1. requestTimer  — Records req.requestStartTime for totalTimeMs in responses.
 *   2. helmet()      — Sets security headers (CSP, X-Frame-Options, etc.)
 *   3. cors()        — Allows cross-origin requests from frontend apps.
 *   4. compression() — Gzips response bodies to reduce transfer size.
 *   5. express.json()— Parses JSON request bodies into req.body.
 *   6. requestLogger — Logs every request/response with timing.
 *   7. Routes        — The actual API endpoints.
 *   8. errorHandler  — MUST be last; catches errors from all routes above.
 *
 * The `import '@core/container'` side-effect import ensures the DI
 * container is bootstrapped before any route handler tries to resolve
 * dependencies from it.
 */
import '@core/container';

import { errorHandler } from '@interfaces/http/middleware/errorHandler';
import { requestLogger } from '@interfaces/http/middleware/requestLogger';
import { requestTimer } from '@interfaces/http/middleware/requestTimer';
import { businessRoutes } from '@interfaces/http/routes/businessRoutes';
import { healthRoutes } from '@interfaces/http/routes/healthRoutes';
import { ingestionRoutes } from '@interfaces/http/routes/ingestionRoutes';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

export function createApp(): express.Express {
  const app = express();

  // Request timing (must be first)
  app.use(requestTimer);

  // Security & compression
  app.use(helmet());
  app.use(cors());
  app.use(compression());

  // Body parsing
  app.use(express.json());

  // Request logging
  app.use(requestLogger);

  // Routes
  app.use('/api/v1', healthRoutes);
  app.use('/api/v1/businesses', businessRoutes);
  app.use('/api/v1', ingestionRoutes);

  // Global error handler (must be registered last)
  app.use(errorHandler);

  return app;
}
