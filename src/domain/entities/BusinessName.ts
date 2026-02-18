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
