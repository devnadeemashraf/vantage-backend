import knex, { Knex } from 'knex';
import type { Business, BusinessRow } from '@domain/entities/Business';
import type { BusinessNameRow } from '@domain/entities/BusinessName';

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

    // Phase 1: Upsert parent rows
    const businessRows: BusinessRow[] = batch.map(toBusinessRow);
    await this.db('businesses').insert(businessRows).onConflict('abn').merge();
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
