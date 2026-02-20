/**
 * Migration 001 — Create the `businesses` Table
 * Layer: Infrastructure (Database)
 *
 * I use Knex migrations so schema changes are versioned and run once (tracked
 * in knex_migrations). One row per ABN; abn is UNIQUE (11 chars). search_vector
 * is TSVECTOR, filled by a trigger in 003. I add B-tree indexes on abn_status,
 * entity_type_code, state, postcode for fast filters; timestamps() gives
 * created_at/updated_at.
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
