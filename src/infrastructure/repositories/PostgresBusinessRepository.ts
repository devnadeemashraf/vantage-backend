import { inject, injectable } from 'tsyringe';
import type { Knex } from 'knex';

import { TOKENS } from '@core/types';
import type { Logger } from '@core/logger';

import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import type { Business, BusinessRow } from '@domain/entities/Business';
import type { BusinessName, BusinessNameRow } from '@domain/entities/BusinessName';
import type { SearchQuery, PaginatedResult } from '@shared/types';

const SIMILARITY_THRESHOLD = 0.3;

@injectable()
export class PostgresBusinessRepository implements IBusinessRepository {
  constructor(
    @inject(TOKENS.Knex) private db: Knex,
    @inject(TOKENS.Logger) private log: Logger,
  ) {}

  async bulkUpsert(rows: BusinessRow[]): Promise<number> {
    if (rows.length === 0) return 0;

    await this.db('businesses').insert(rows).onConflict('abn').merge();

    this.log.debug({ count: rows.length }, 'bulkUpsert complete');
    return rows.length;
  }

  async bulkInsertNames(rows: BusinessNameRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db('business_names').insert(rows);
    this.log.debug({ count: rows.length }, 'bulkInsertNames complete');
  }

  async getIdsByAbns(abns: string[]): Promise<Map<string, number>> {
    if (abns.length === 0) return new Map();

    const rows: { id: number; abn: string }[] = await this.db('businesses')
      .select('id', 'abn')
      .whereIn('abn', abns);

    return new Map(rows.map((r) => [r.abn, r.id]));
  }

  // ---------------------------------------------------------------------------
  // Single-record lookup
  // ---------------------------------------------------------------------------

  async findByAbn(abn: string): Promise<Business | null> {
    const row = await this.db('businesses').where('abn', abn).first();
    if (!row) return null;

    const nameRows: BusinessName[] = await this.db('business_names')
      .where('business_id', row.id)
      .select('id', 'business_id as businessId', 'name_type as nameType', 'name_text as nameText');

    return this.toDomain(row, nameRows);
  }

  // ---------------------------------------------------------------------------
  // Full-text + fuzzy search (tsvector + pg_trgm)
  // ---------------------------------------------------------------------------

  async search(query: SearchQuery): Promise<PaginatedResult<Business>> {
    const { term, page, limit } = query;
    if (!term) return this.findWithFilters(query);

    const offset = (page - 1) * limit;
    const tsQuery = this.buildTsQuery(term);

    // Base query: combine tsvector rank (semantic) with trgm similarity (typo-tolerant).
    // ts_rank weights: {D, C, B, A} — we set A=1.0 (entity_name) and B=0.4 (given/family).
    // similarity() returns 0..1 based on trigram overlap.
    // The final score blends both: 60% text rank + 40% trigram similarity.
    const baseQuery = this.db('businesses')
      .select(
        'businesses.*',
        this.db.raw(
          `(
            0.6 * ts_rank(search_vector, to_tsquery('english', ?), 32) +
            0.4 * similarity(entity_name, ?)
          ) AS relevance`,
          [tsQuery, term],
        ),
      )
      .where(function () {
        this.whereRaw("search_vector @@ to_tsquery('english', ?)", [tsQuery]).orWhereRaw(
          'similarity(entity_name, ?) > ?',
          [term, SIMILARITY_THRESHOLD],
        );
      });

    applyFilters(baseQuery, query);

    const countQuery = baseQuery.clone().clearSelect().clearOrder().count('* as total').first();
    const dataQuery = baseQuery.orderBy('relevance', 'desc').limit(limit).offset(offset);

    const [countResult, rows] = await Promise.all([countQuery, dataQuery]);
    const total = parseInt(String((countResult as { total: string })?.total ?? '0'), 10);

    return {
      data: rows.map((r: Record<string, unknown>) => this.toDomain(r)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Filter-only listing (no text search)
  // ---------------------------------------------------------------------------

  async findWithFilters(query: SearchQuery): Promise<PaginatedResult<Business>> {
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const baseQuery = this.db('businesses').select('businesses.*');
    applyFilters(baseQuery, query);

    const countQuery = baseQuery.clone().clearSelect().clearOrder().count('* as total').first();
    const dataQuery = baseQuery.orderBy('entity_name', 'asc').limit(limit).offset(offset);

    const [countResult, rows] = await Promise.all([countQuery, dataQuery]);
    const total = parseInt(String((countResult as { total: string })?.total ?? '0'), 10);

    return {
      data: rows.map((r: Record<string, unknown>) => this.toDomain(r)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Converts a raw search term into a tsquery string.
   * "plumbing sydney" -> "plumbing:* & sydney:*"
   * The :* suffix enables prefix matching ("plumb" matches "plumbing").
   */
  private buildTsQuery(term: string): string {
    return term
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `${word}:*`)
      .join(' & ');
  }

  /** Maps a snake_case DB row to the camelCase Business domain entity. */
  private toDomain(row: Record<string, unknown>, names?: BusinessName[]): Business {
    return {
      id: row.id as number,
      abn: row.abn as string,
      abnStatus: row.abn_status as string,
      abnStatusFrom: row.abn_status_from ? new Date(row.abn_status_from as string) : null,
      entityTypeCode: row.entity_type_code as string,
      entityTypeText: row.entity_type_text as string,
      entityName: row.entity_name as string,
      givenName: (row.given_name as string) ?? null,
      familyName: (row.family_name as string) ?? null,
      state: (row.state as string) ?? null,
      postcode: (row.postcode as string) ?? null,
      gstStatus: (row.gst_status as string) ?? null,
      gstFromDate: row.gst_from_date ? new Date(row.gst_from_date as string) : null,
      acn: (row.acn as string) ?? null,
      recordLastUpdated: row.record_last_updated
        ? new Date(row.record_last_updated as string)
        : null,
      businessNames: names,
      createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Shared filter application (used by both search and findWithFilters)
// ---------------------------------------------------------------------------

function applyFilters(qb: Knex.QueryBuilder, query: SearchQuery): void {
  if (query.state) qb.where('state', query.state);
  if (query.postcode) qb.where('postcode', query.postcode);
  if (query.entityType) qb.where('entity_type_code', query.entityType);
  if (query.abnStatus) qb.where('abn_status', query.abnStatus);
}
