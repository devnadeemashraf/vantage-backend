import type { Business } from '@domain/entities/Business';

/**
 * Data Source Adapter Interface
 * Layer: Domain
 * Pattern: Adapter Pattern
 *
 * The Adapter Pattern is like a travel power adapter — it converts one plug
 * shape (raw external data) into another (our domain entity) so they fit
 * together. The ETL pipeline doesn't care whether the raw data came from
 * an XML file, a JSON API, or a CSV spreadsheet; it just calls `normalize()`
 * and gets a clean Business entity back.
 *
 * The generic `TRaw` type parameter lets each adapter declare what shape of
 * raw data it expects:
 *   - XmlDataSourceAdapter implements IDataSourceAdapter<RawAbrRecord>
 *   - A future JsonAdapter could implement IDataSourceAdapter<JsonApiPayload>
 *
 * This keeps the ingestion pipeline (batchProcessor, etlWorker) completely
 * decoupled from the data format — swap the adapter, swap the source.
 */
export interface IDataSourceAdapter<TRaw = unknown> {
  normalize(raw: TRaw): Business;
}
