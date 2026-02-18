import type { Business } from '@domain/entities/Business';

/**
 * Normalizes raw data from any source (XML, JSON, API) into a Business entity.
 * Implementing the Adapter pattern lets us swap ingestion sources without
 * touching the ETL pipeline or domain logic.
 */
export interface IDataSourceAdapter<TRaw = unknown> {
  normalize(raw: TRaw): Business;
}
