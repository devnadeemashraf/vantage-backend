/**
 * Batch Processor — Buffered Bulk Insert Engine
 * Layer: Workers (ETL)
 *
 * When ingesting hundreds of thousands of records, inserting one row at a time
 * would be like mailing letters one by one instead of filling a mailbag and
 * sending them all at once. This class buffers entities in memory and flushes
 * them to PostgreSQL in large batches for dramatically better throughput.
 *
 * The flush operation is a multi-phase process:
 *
 *   Phase 1: Upsert parent rows (businesses table)
 *     - INSERT ... ON CONFLICT (abn) MERGE — if the ABN already exists, the
 *       row is updated instead of duplicated. This makes re-runs idempotent.
 *     - Rows are chunked to stay under PostgreSQL's hard limit of 65,535
 *       bind parameters per query. With 14 columns per business row, that's
 *       ~4,681 rows per INSERT. Exceeding this limit causes a cryptic
 *       "bind message has X parameter formats but 0 parameters" error.
 *
 *   Phase 2-5: Link and insert child rows (business_names table)
 *     - Fetch the DB-assigned IDs for the ABNs we just upserted.
 *     - Delete existing names (so re-runs don't create duplicates).
 *     - Insert fresh name rows linked by business_id.
 *
 * Why does the worker own its own Knex connection pool?
 *   Worker threads run in a separate V8 isolate — they have their own heap,
 *   event loop, and cannot share objects (including TCP sockets) with the
 *   main thread. So the worker creates its own small pool (min:1, max:3).
 */
import type { Business, BusinessRow } from '@domain/entities/Business';
import type { BusinessNameRow } from '@domain/entities/BusinessName';
import knex, { Knex } from 'knex';

interface DbConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  pool: { min: number; max: number };
}

/**
 * Accumulates Business entities and flushes them to PostgreSQL in batches.
 *
 * Two-phase flush:
 *   1. Upsert the businesses (parent rows).
 *   2. Fetch the DB-assigned IDs for those ABNs.
 *   3. Delete old business_names for those IDs (ensures idempotent re-runs).
 *   4. Insert the new business_names (child rows) linked by business_id.
 *
 * The worker thread creates its own Knex instance because worker_threads
 * run in a separate V8 isolate and cannot share the main thread's pool.
 */
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
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.name,
        user: dbConfig.user,
        password: dbConfig.password,
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

    // Phase 1: Upsert parent rows (chunked to stay under PG's 65535 param limit)
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

    // Phase 2: Collect all business_names across the batch
    const allNames: { abn: string; nameType: string; nameText: string }[] = [];
    for (const entity of batch) {
      if (entity.businessNames && entity.businessNames.length > 0) {
        for (const bn of entity.businessNames) {
          allNames.push({ abn: entity.abn, nameType: bn.nameType, nameText: bn.nameText });
        }
      }
    }

    if (allNames.length === 0) return;

    // Phase 3: Fetch IDs for the ABNs we just upserted
    const abns = [...new Set(allNames.map((n) => n.abn))];
    const idRows: { id: number; abn: string }[] = await this.db('businesses')
      .select('id', 'abn')
      .whereIn('abn', abns);
    const abnToId = new Map(idRows.map((r) => [r.abn, r.id]));

    // Phase 4: Delete existing names for these businesses (idempotent re-run)
    const businessIds = [...abnToId.values()];
    await this.db('business_names').whereIn('business_id', businessIds).del();

    // Phase 5: Insert fresh business_names
    const nameRows: BusinessNameRow[] = allNames
      .filter((n) => abnToId.has(n.abn))
      .map((n) => ({
        business_id: abnToId.get(n.abn)!,
        name_type: n.nameType,
        name_text: n.nameText,
      }));

    if (nameRows.length > 0) {
      // Knex has a limit of ~65535 bindings per query; chunk large name sets
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
