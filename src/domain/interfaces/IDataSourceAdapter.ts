/**
 * Data Source Adapter Interface
 * Layer: Domain
 * Pattern: Adapter Pattern
 *
 * I use this so the ETL pipeline doesn’t depend on a specific data format.
 * The pipeline calls normalize(raw) and gets a Business back; the adapter
 * (e.g. XmlDataSourceAdapter for ABR XML) handles the shape conversion.
 * A future JSON or CSV source would just implement the same interface with
 * a different TRaw type — the batch processor and worker stay unchanged.
 */
import type { Business } from '@domain/entities/Business';

export interface IDataSourceAdapter<TRaw = unknown> {
  normalize(raw: TRaw): Business;
}
