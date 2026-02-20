/**
 * Batch Processor — Buffered Bulk Insert
 * Layer: Workers (ETL)
 *
 * I buffer entities and flush in batches so we don’t do one INSERT per record.
 * Flush: (1) upsert businesses in chunks (PG 65,535 bind-param limit); (2) collect
 * business_names; (3) fetch DB ids; (4) delete existing names; (5) insert new names.
 * The worker has its own Knex pool because worker_threads can’t share the main thread’s sockets.
 *
 * Concurrency: a mutex ensures only one flush runs at a time (no overlapping flushes,
 * so the pool is never exhausted by concurrent flushes). Each batch is written inside
 * a single transaction so retries roll back fully and no partial state is left.
 *
 * Retries: on connection errors we retry the whole flush with backoff. Pacing: optional
 * delay after each flush to avoid rate limiting the DB.
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

/** ETL tuning: retries, backoff, pacing, pool idle timeout. */
export interface EtlOptions {
  retryAttempts: number;
  retryDelayMs: number;
  flushDelayMs: number;
  poolIdleTimeoutMs: number;
}

const DEFAULT_ETL_OPTIONS: EtlOptions = {
  retryAttempts: 3,
  retryDelayMs: 1000,
  flushDelayMs: 200,
  poolIdleTimeoutMs: 240_000,
};

function isRetryableConnectionError(err: unknown): boolean {
  const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : null;
  const message = err instanceof Error ? err.message : String(err);
  const connectionErrorCodes =
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === '57P01'; // admin shutdown
  const connectionErrorMessage =
    /connection terminated|terminated unexpectedly|connection closed|connection.*reset/i.test(
      message,
    );
  const poolTimeoutMessage = /timeout acquiring a connection|pool is probably full/i.test(message);
  return connectionErrorCodes || connectionErrorMessage || poolTimeoutMessage;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** PostgreSQL max bind parameters per query (wire protocol). Stay under to avoid "exceeded params" / connection drop. */
const PG_MAX_BIND_PARAMS = 65535;
/** Businesses table column count; used to chunk INSERTs so param count stays under limit. */
const BUSINESS_COLS = 14;
/** Absolute max rows per businesses INSERT by param limit. */
const MAX_BUSINESS_ROWS_BY_PARAMS = Math.floor((PG_MAX_BIND_PARAMS - 1) / BUSINESS_COLS);
/**
 * We use a smaller chunk (1000 rows) so each INSERT finishes quickly over the network.
 * Reduces chance of "Connection terminated unexpectedly" on long-running seeds to remote DBs
 * (e.g. Render); still under the param limit.
 */
const MAX_BUSINESS_ROWS_PER_INSERT = Math.min(1000, MAX_BUSINESS_ROWS_BY_PARAMS);
/** business_names has 3 columns; chunk inserts the same way. */
const MAX_NAME_ROWS_PER_INSERT = Math.floor((PG_MAX_BIND_PARAMS - 1) / 3);

export class BatchProcessor {
  private buffer: Business[] = [];
  private db: Knex;
  private totalInserted = 0;
  private totalUpdated = 0;
  private etlOptions: EtlOptions;
  /** Serializes flushes so only one runs at a time; prevents pool exhaustion from overlapping flushes. */
  private flushMutex: Promise<void> = Promise.resolve();

  constructor(
    dbConfig: DbConfig,
    private batchSize: number,
    etlOptions?: Partial<EtlOptions>,
  ) {
    this.etlOptions = { ...DEFAULT_ETL_OPTIONS, ...etlOptions };
    this.db = knex({
      client: 'pg',
      connection: {
        connectionString: dbConfig.url,
      },
      pool: {
        min: 2,
        max: 4,
        idleTimeoutMillis: this.etlOptions.poolIdleTimeoutMs,
      },
      acquireConnectionTimeout: 60_000,
    });
  }

  async add(entity: Business): Promise<void> {
    this.buffer.push(entity);
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Flush is concurrency-safe: callers are serialized via a mutex so only one
   * flush runs at a time. No overlapping flush() calls → at most one connection
   * in use for writes → no pool exhaustion.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    const previous = this.flushMutex;
    let resolveMutex!: () => void;
    this.flushMutex = new Promise<void>((resolve) => {
      resolveMutex = resolve;
    });
    await previous.then(() => this.runOneFlush(batch)).finally(() => resolveMutex());
  }

  /**
   * One batch: retry loop + transaction. Transaction ensures a failed or retried
   * batch leaves no partial state (all-or-nothing per batch).
   */
  private async runOneFlush(batch: Business[]): Promise<void> {
    const { retryAttempts, retryDelayMs, flushDelayMs } = this.etlOptions;
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        await this.db.transaction(async (trx) => {
          await this.doFlushWithTrx(trx, batch);
        });
        this.totalInserted += batch.length;
        if (flushDelayMs > 0) await delay(flushDelayMs);
        return;
      } catch (err) {
        if (!isRetryableConnectionError(err) || attempt === retryAttempts) throw err;
        const backoffMs = retryDelayMs * Math.pow(2, attempt - 1);
        await delay(backoffMs);
      }
    }
  }

  /** Performs the actual DB writes for one batch inside the given transaction. */
  private async doFlushWithTrx(trx: Knex.Transaction, batch: Business[]): Promise<void> {
    const businessRows: BusinessRow[] = batch.map(toBusinessRow);
    for (let i = 0; i < businessRows.length; i += MAX_BUSINESS_ROWS_PER_INSERT) {
      await trx('businesses')
        .insert(businessRows.slice(i, i + MAX_BUSINESS_ROWS_PER_INSERT))
        .onConflict('abn')
        .merge();
    }

    const allNames: { abn: string; nameType: string; nameText: string }[] = [];
    for (const entity of batch) {
      if (entity.businessNames && entity.businessNames.length > 0) {
        for (const bn of entity.businessNames) {
          allNames.push({ abn: entity.abn, nameType: bn.nameType, nameText: bn.nameText });
        }
      }
    }

    if (allNames.length === 0) return;

    const abns = [...new Set(allNames.map((n) => n.abn))];
    const idRows: { id: number; abn: string }[] = await trx('businesses')
      .select('id', 'abn')
      .whereIn('abn', abns);
    const abnToId = new Map(idRows.map((r) => [r.abn, r.id]));

    const businessIds = [...abnToId.values()];
    await trx('business_names').whereIn('business_id', businessIds).del();

    const nameRows: BusinessNameRow[] = allNames
      .filter((n) => abnToId.has(n.abn))
      .map((n) => ({
        business_id: abnToId.get(n.abn)!,
        name_type: n.nameType,
        name_text: n.nameText,
      }));

    if (nameRows.length > 0) {
      for (let i = 0; i < nameRows.length; i += MAX_NAME_ROWS_PER_INSERT) {
        await trx('business_names').insert(nameRows.slice(i, i + MAX_NAME_ROWS_PER_INSERT));
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
