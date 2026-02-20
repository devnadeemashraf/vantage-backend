/**
 * Express Application Factory
 * Layer: Interfaces (HTTP)
 * Pattern: Factory Function
 *
 * I return a new Express app each time so each cluster worker (and each
 * integration test) gets its own instance with no shared state. I wire
 * middleware in order: requestTimer first (for totalTimeMs), then
 * helmet/cors/compression/json, requestLogger, routes, and errorHandler
 * last so it catches everything. The side-effect import of @core/container
 * bootstraps DI before any route resolves dependencies.
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
  app.use(
    cors({
      origin: ['http://localhost:5173', 'https://vantage-frontend-vp5f.onrender.com'],
      credentials: true,
    }),
  );
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
