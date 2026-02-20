/**
 * Batch Processor — Buffered Bulk Insert
 * Layer: Workers (ETL)
 *
 * I buffer entities and flush in batches so we don’t do one INSERT per record.
 * Flush: (1) upsert businesses in chunks (PG has a 65,535 bind-param limit per
 * query, so with 14 cols we do ~4,681 rows per INSERT); (2) collect business_names;
 * (3) fetch DB ids for the upserted ABNs; (4) delete existing names for those ids
 * (idempotent re-run); (5) insert new names. The worker has its own Knex pool
 * because worker_threads can’t share the main thread’s sockets.
 */
import type { Business, BusinessRow } from '@domain/entities/Business';
import type { BusinessNameRow } from '@domain/entities/BusinessName';
import knex, { Knex } from 'knex';

/** Database config passed from main thread (matches config.database: url + ssl + pool). */
export interface DbConfig {
  url: string;
  ssl: boolean;
  pool: { min: number; max: number };
}

export class BatchProcessor {
  private buffer: Business[] = [];
  private db: Knex;
  private totalInserted = 0;
  private totalUpdated = 0;

  constructor(
    dbConfig: DbConfig,
    private batchSize: number,
  ) {
    this.db = knex({
      client: 'pg',
      connection: {
        connectionString: dbConfig.url,
        ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
      },
      pool: { min: 1, max: 3 },
    });
  }

  async add(entity: Business): Promise<void> {
    this.buffer.push(entity);
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);

    // Upsert businesses in chunks (PG 65535 param limit)
    const businessRows: BusinessRow[] = batch.map(toBusinessRow);
    const COLS = 14;
    const MAX_ROWS_PER_INSERT = Math.floor(65535 / COLS);
    for (let i = 0; i < businessRows.length; i += MAX_ROWS_PER_INSERT) {
      await this.db('businesses')
        .insert(businessRows.slice(i, i + MAX_ROWS_PER_INSERT))
        .onConflict('abn')
        .merge();
    }
    this.totalInserted += batch.length;

    // Collect business_names from batch
    const allNames: { abn: string; nameType: string; nameText: string }[] = [];
    for (const entity of batch) {
      if (entity.businessNames && entity.businessNames.length > 0) {
        for (const bn of entity.businessNames) {
          allNames.push({ abn: entity.abn, nameType: bn.nameType, nameText: bn.nameText });
        }
      }
    }

    if (allNames.length === 0) return;

    // Fetch DB ids for upserted ABNs
    const abns = [...new Set(allNames.map((n) => n.abn))];
    const idRows: { id: number; abn: string }[] = await this.db('businesses')
      .select('id', 'abn')
      .whereIn('abn', abns);
    const abnToId = new Map(idRows.map((r) => [r.abn, r.id]));

    // Delete existing names (idempotent re-run)
    const businessIds = [...abnToId.values()];
    await this.db('business_names').whereIn('business_id', businessIds).del();

    // Insert fresh business_names
    const nameRows: BusinessNameRow[] = allNames
      .filter((n) => abnToId.has(n.abn))
      .map((n) => ({
        business_id: abnToId.get(n.abn)!,
        name_type: n.nameType,
        name_text: n.nameText,
      }));

    if (nameRows.length > 0) {
      // Chunk to stay under bind limit
      const CHUNK = 5000;
      for (let i = 0; i < nameRows.length; i += CHUNK) {
        await this.db('business_names').insert(nameRows.slice(i, i + CHUNK));
      }
    }
  }

  async destroy(): Promise<{ totalInserted: number; totalUpdated: number }> {
    await this.db.destroy();
    return { totalInserted: this.totalInserted, totalUpdated: this.totalUpdated };
  }
}

function toBusinessRow(entity: Business): BusinessRow {
  return {
    abn: entity.abn,
    abn_status: entity.abnStatus,
    abn_status_from: entity.abnStatusFrom,
    entity_type_code: entity.entityTypeCode,
    entity_type_text: entity.entityTypeText,
    entity_name: entity.entityName,
    given_name: entity.givenName,
    family_name: entity.familyName,
    state: entity.state,
    postcode: entity.postcode,
    gst_status: entity.gstStatus,
    gst_from_date: entity.gstFromDate,
    acn: entity.acn,
    record_last_updated: entity.recordLastUpdated,
  };
}
