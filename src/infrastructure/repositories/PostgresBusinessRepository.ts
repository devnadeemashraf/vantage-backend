/**
 * PostgreSQL Business Repository — Data Access Implementation
 * Layer: Infrastructure
 * Pattern: Repository Pattern (implements IBusinessRepository)
 *
 * I implement the domain’s IBusinessRepository using PostgreSQL and Knex.
 * technique=native uses ILIKE on entity_name (sequential scan, ~350 ms on 9M
 * rows — baseline). technique=optimized uses the search_vector column and GIN
 * index from migration 003 (search_vector @@ to_tsquery), usually sub-50 ms.
 * Both paths share runPaginatedSearch (capped total, full pagination); no
 * search term → findWithFilters(). @injectable so tsyringe injects Knex and Logger.
 */
import { config } from '@core/config';
import type { Logger } from '@core/logger';
import { TOKENS } from '@core/types';
import type { Business, BusinessRow } from '@domain/entities/Business';
import type { BusinessName, BusinessNameRow } from '@domain/entities/BusinessName';
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import type { BusinessLookupResult, PaginatedResult, SearchQuery } from '@shared/types';
import type { Knex } from 'knex';
import { inject, injectable } from 'tsyringe';

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

  /** Single business by ABN (unique index), including business_names. I track queryTimeMs for the API. */
  async findByAbn(abn: string): Promise<BusinessLookupResult<Business>> {
    const startMs = Date.now();

    const row = await this.db('businesses').where('abn', abn).first();
    if (!row) {
      return { business: null, queryTimeMs: Math.round(Date.now() - startMs) };
    }

    const nameRows: BusinessName[] = await this.db('business_names')
      .where('business_id', row.id)
      .select('id', 'business_id as businessId', 'name_type as nameType', 'name_text as nameText');

    const queryTimeMs = Math.round(Date.now() - startMs);
    return { business: this.toDomain(row, nameRows), queryTimeMs };
  }

  /** Native path: ILIKE on entity_name only. No term → findWithFilters(). */
  async searchNative(query: SearchQuery): Promise<PaginatedResult<Business>> {
    if (!query.term) return this.findWithFilters(query);
    const trimmedTerm = query.term.trim();
    if (trimmedTerm.length === 0) return this.findWithFilters(query);
    const base = this.buildSearchQuery(trimmedTerm, query);
    return this.runPaginatedSearch(base, query);
  }

  /** Optimized path: search_vector @@ to_tsquery so PG uses the GIN index (sub-50 ms vs ~350 ms ILIKE). */
  async searchOptimized(query: SearchQuery): Promise<PaginatedResult<Business>> {
    if (!query.term) return this.findWithFilters(query);
    const trimmedTerm = query.term.trim();
    if (trimmedTerm.length === 0) return this.findWithFilters(query);

    const tsQuery = this.buildTsQuery(trimmedTerm);
    if (tsQuery === '') return this.findWithFilters(query);

    const base = this.buildFtsSearchQuery(tsQuery, query);
    return this.runPaginatedSearch(base, query);
  }

  /** Filter-only listing (no term), same capped total and pagination as search. */
  async findWithFilters(query: SearchQuery): Promise<PaginatedResult<Business>> {
    const base = this.buildSearchQuery(null, query);
    return this.runPaginatedSearch(base, query);
  }

  /** Base query for native path: entity_name ILIKE when term present, plus filters. */
  private buildSearchQuery(trimmedTerm: string | null, query: SearchQuery): Knex.QueryBuilder {
    const qb = this.db('businesses');
    if (trimmedTerm != null && trimmedTerm.length > 0) {
      const pattern = `%${this.escapeLike(trimmedTerm)}%`;
      qb.whereRaw("entity_name ILIKE ? ESCAPE E'\\\\'", [pattern]);
    }
    applyFilters(qb, query);
    return qb;
  }

  /** Turn search term into tsquery: last word gets :* (prefix) so "plumbing syd" matches plumbing + sydney. */
  private buildTsQuery(term: string): string {
    const words = term.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    const lastWord = words.pop()! + ':*';
    return words.length > 0 ? [...words, lastWord].join(' & ') : lastWord;
  }

  /** Base query for optimized path: search_vector @@ to_tsquery + filters; GIN index avoids seq scan. */
  private buildFtsSearchQuery(tsQuery: string, query: SearchQuery): Knex.QueryBuilder {
    const qb = this.db('businesses').whereRaw("search_vector @@ to_tsquery('english', ?)", [
      tsQuery,
    ]);
    applyFilters(qb, query);
    return qb;
  }

  /** Capped count + page of data from base query. I cap total at maxCandidates so latency stays predictable. */
  private async runPaginatedSearch(
    baseQuery: Knex.QueryBuilder,
    query: SearchQuery,
  ): Promise<PaginatedResult<Business>> {
    const { page, limit } = query;
    const offset = (page - 1) * limit;
    const { maxCandidates } = config.search;

    const cappedCountSubquery = baseQuery
      .clone()
      .select(this.db.raw('1'))
      .orderBy('entity_name', 'asc')
      .limit(maxCandidates)
      .as('capped');
    const countQuery = this.db.from(cappedCountSubquery).count('* as total').first();

    const dataQuery = baseQuery
      .clone()
      .select('businesses.*')
      .orderBy('entity_name', 'asc')
      .limit(limit)
      .offset(offset);

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

  /** Escape % and _ for safe use inside ILIKE (backslash as escape). */
  private escapeLike(term: string): string {
    return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  /** Map snake_case row to camelCase Business (single place for this conversion). */
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

/** Apply optional state/postcode/entityType/abnStatus filters to the query builder. */
function applyFilters(qb: Knex.QueryBuilder, query: SearchQuery): void {
  if (query.state) qb.where('state', query.state);
  if (query.postcode) qb.where('postcode', query.postcode);
  if (query.entityType) qb.where('entity_type_code', query.entityType);
  if (query.abnStatus) qb.where('abn_status', query.abnStatus);
}
