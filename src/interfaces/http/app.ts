import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

import '@core/container';
import { requestLogger } from '@interfaces/http/middleware/requestLogger';
import { errorHandler } from '@interfaces/http/middleware/errorHandler';
import { businessRoutes } from '@interfaces/http/routes/businessRoutes';
import { ingestionRoutes } from '@interfaces/http/routes/ingestionRoutes';
import { healthRoutes } from '@interfaces/http/routes/healthRoutes';

export function createApp(): express.Express {
  const app = express();

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
