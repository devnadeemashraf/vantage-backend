/**
 * Migration 003 — Full-text search (tsvector + GIN)
 * Layer: Infrastructure (Database)
 *
 * I added this so we can avoid full-table scans: ILIKE '%term%' on 9M rows
 * is ~350 ms. The search_vector column (from 001) holds pre-computed lexemes;
 * a trigger keeps it updated on INSERT/UPDATE so we never compute to_tsvector
 * at query time. The GIN index lets search_vector @@ to_tsquery use an index
 * lookup instead of a seq scan — typically sub-50 ms. Weights A/B/C (entity_name
 * highest, state/postcode lowest) are for future ts_rank use; for now we only
 * use @@ for matching. technique=native still uses ILIKE so you can compare.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Trigger function: set search_vector from text columns (weights A/B/C for future ranking).
  await knex.raw(`
    CREATE OR REPLACE FUNCTION businesses_search_vector_trigger() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.entity_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.given_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.family_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.state, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.postcode, '')), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);

  // Trigger: run before INSERT/UPDATE so search_vector stays in sync.
  await knex.raw(`
    CREATE TRIGGER trg_businesses_search_vector
    BEFORE INSERT OR UPDATE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION businesses_search_vector_trigger()
  `);

  // Backfill NULL search_vector on existing rows (one-time; can be slow on large tables).
  await knex.raw(`
    UPDATE businesses
    SET search_vector =
      setweight(to_tsvector('english', COALESCE(entity_name, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(given_name, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(family_name, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(state, '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(postcode, '')), 'C')
    WHERE search_vector IS NULL
  `);

  // GIN index so @@ to_tsquery uses the index.
  await knex.raw(`
    CREATE INDEX idx_businesses_search_vector
    ON businesses USING GIN (search_vector)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS trg_businesses_search_vector ON businesses');
  await knex.raw('DROP FUNCTION IF EXISTS businesses_search_vector_trigger()');
  await knex.raw('DROP INDEX IF EXISTS idx_businesses_search_vector');
}
