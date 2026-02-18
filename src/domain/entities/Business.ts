import type { BusinessName } from './BusinessName';

export interface Business {
  id?: number;
  abn: string;
  abnStatus: string;
  abnStatusFrom: Date | null;
  entityTypeCode: string;
  entityTypeText: string;
  entityName: string;
  givenName: string | null;
  familyName: string | null;
  state: string | null;
  postcode: string | null;
  gstStatus: string | null;
  gstFromDate: Date | null;
  acn: string | null;
  recordLastUpdated: Date | null;
  businessNames?: BusinessName[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BusinessRow {
  abn: string;
  abn_status: string;
  abn_status_from: Date | null;
  entity_type_code: string;
  entity_type_text: string;
  entity_name: string;
  given_name: string | null;
  family_name: string | null;
  state: string | null;
  postcode: string | null;
  gst_status: string | null;
  gst_from_date: Date | null;
  acn: string | null;
  record_last_updated: Date | null;
}
