/**
 * BusinessName Value Object
 * Layer: Domain
 *
 * One business can have many names (trading names, DGR names, etc.) — a simple
 * 1-to-many. I model it as a value object: no identity outside the parent
 * Business; when the business is deleted, names go with it (CASCADE in the DB).
 *
 * Same dual-interface idea as Business.ts: BusinessName (camelCase) for the
 * app, BusinessNameRow (snake_case) for the database.
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
