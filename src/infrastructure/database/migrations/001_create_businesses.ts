/**
 * Migration 001 — Create the `businesses` Table
 * Layer: Infrastructure (Database)
 *
 * This is a Knex "migration" — a versioned script that modifies the database
 * schema. Migrations run in order (001, 002, 003...) and are tracked in a
 * `knex_migrations` table so they only execute once. Think of them as **git
 * commits for your database schema**: you can roll forward (`up`) or roll
 * back (`down`).
 *
 * The `businesses` table is the primary table — one row per Australian
 * Business Number (ABN). Key design decisions:
 *
 *   - `abn` is UNIQUE and has a max length of 11 chars (ABN spec).
 *   - `search_vector` is a TSVECTOR column — PostgreSQL's built-in full-text
 *     search data type. It's populated by a trigger (see migration 003).
 *   - B-tree indexes on abn_status, entity_type_code, state, postcode enable
 *     fast equality filtering (WHERE state = 'NSW') without scanning all rows.
 *   - `timestamps(true, true)` adds `created_at` and `updated_at` columns
 *     with auto-maintained defaults.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('businesses', (table) => {
    table.increments('id').primary();
    table.string('abn', 11).notNullable().unique();
    table.string('abn_status', 3).notNullable();
    table.date('abn_status_from');
    table.string('entity_type_code', 4).notNullable();
    table.string('entity_type_text', 100);
    table.string('entity_name', 200).notNullable();
    table.string('given_name', 200);
    table.string('family_name', 100);
    table.string('state', 3);
    table.string('postcode', 10);
    table.string('gst_status', 3);
    table.date('gst_from_date');
    table.string('acn', 9);
    table.date('record_last_updated');

    table.specificType('search_vector', 'TSVECTOR');

    table.timestamps(true, true);

    table.index('abn_status', 'idx_businesses_abn_status');
    table.index('entity_type_code', 'idx_businesses_entity_type');
    table.index('state', 'idx_businesses_state');
    table.index('postcode', 'idx_businesses_postcode');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('businesses');
}
