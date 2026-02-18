/**
 * BusinessName Value Object
 * Layer: Domain
 *
 * A single business can have multiple names — trading names, DGR fund names,
 * legal names, etc. This is a classic 1-to-many relationship:
 *
 *   Business (1) ──< BusinessName (many)
 *
 * For example, ABN 12345678901 might be registered as:
 *   - "Smith Holdings Pty Ltd" (entity_name on the Business)
 *   - "Smith's Plumbing"       (trading name — BusinessName with type 'TRD')
 *   - "Reliable Pipes"         (another trading name)
 *
 * This is a "value object" in DDD terms — it has no identity of its own
 * outside the parent Business. If the Business is deleted, its names go too
 * (enforced by CASCADE in the database migration).
 *
 * The dual interface pattern (BusinessName / BusinessNameRow) follows the
 * same camelCase-vs-snake_case convention explained in Business.ts.
 */
export interface BusinessName {
  id?: number;
  businessId?: number;
  nameType: string;
  nameText: string;
}

export interface BusinessNameRow {
  business_id: number;
  name_type: string;
  name_text: string;
}
