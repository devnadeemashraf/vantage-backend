/**
 * Migration 002 — Create the `business_names` Table
 * Layer: Infrastructure (Database)
 *
 * This table stores the 1-to-many trading names, DGR fund names, and other
 * alternate names associated with a business. One ABN can have many names:
 *
 *   businesses (1) ──< business_names (many)
 *
 * Design decisions:
 *   - `business_id` is a foreign key referencing businesses(id).
 *   - `ON DELETE CASCADE` means if a business row is deleted, all its names
 *     are automatically removed — no orphaned rows.
 *   - `name_type` uses 3-char codes from the ABR schema: 'TRD' (trading),
 *     'BN' (business name), 'DGR' (deductible gift recipient), etc.
 *   - An index on `business_id` speeds up the JOIN when fetching a business
 *     with all its names (common in the findByAbn endpoint).
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('business_names', (table) => {
    table.increments('id').primary();
    table
      .integer('business_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('businesses')
      .onDelete('CASCADE');
    table.string('name_type', 3).notNullable();
    table.string('name_text', 200).notNullable();

    table.timestamps(true, true);

    table.index('business_id', 'idx_business_names_business_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('business_names');
}
