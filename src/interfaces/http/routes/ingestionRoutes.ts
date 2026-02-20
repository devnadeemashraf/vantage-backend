/**
 * Ingestion Routes
 * Layer: Interfaces (HTTP)
 *
 * I expose POST /api/v1/ingest with body { filePath } to trigger ETL. The
 * seed script is the main way we run ingestion; this endpoint is for
 * programmatic or remote triggers.
 */
import { IngestionController } from '@interfaces/http/controllers/IngestionController';
import { Router } from 'express';

const router = Router();
const controller = new IngestionController();

router.post('/ingest', controller.ingest);

export { router as ingestionRoutes };
