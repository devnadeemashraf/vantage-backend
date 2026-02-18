/**
 * Ingestion Routes
 * Layer: Interfaces (HTTP)
 *
 * Exposes the ETL ingestion trigger via HTTP:
 *
 *   POST /api/v1/ingest  { "filePath": "./temp/data.xml" }
 *
 * This is mounted under `/api/v1` in app.ts. In practice, the seed CLI
 * script (npm run seed) is the primary way to trigger ingestion; this
 * HTTP endpoint exists for programmatic/remote triggering.
 */
import { IngestionController } from '@interfaces/http/controllers/IngestionController';
import { Router } from 'express';

const router = Router();
const controller = new IngestionController();

router.post('/ingest', controller.ingest);

export { router as ingestionRoutes };
