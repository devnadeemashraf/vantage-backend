/** ABN status codes from the ABR schema. */
export const ABN_STATUS = {
  ACTIVE: 'ACT',
  CANCELLED: 'CAN',
} as const;

/** GST registration status codes. */
export const GST_STATUS = {
  ACTIVE: 'ACT',
  CANCELLED: 'CAN',
  NOT_REGISTERED: 'NON',
} as const;

/** Australian state/territory codes from the ABR StateEnum. */
export const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT', 'AAT'] as const;

/** Name type codes used in OtherEntity and IndividualName. */
export const NAME_TYPES = {
  MAIN: 'MN',
  LEGAL: 'LGL',
  TRADING: 'TRD',
  OTHER: 'OTN',
  BUSINESS: 'BN',
  DGR: 'DGR',
} as const;

/**
 * Common entity type codes from the ABR EntityTypeEnum.
 * The full dataset has 100+ codes; these are the most frequently occurring.
 */
export const ENTITY_TYPES: Record<string, string> = {
  IND: 'Individual/Sole Trader',
  PRV: 'Australian Private Company',
  PUB: 'Australian Public Company',
  FPT: 'Family Partnership',
  PTR: 'Other Partnership',
  TRT: 'Other trust',
  DTT: 'Discretionary Trading Trust',
  DIT: 'Discretionary Investment Trust',
  SMF: 'ATO Regulated Self-Managed Superannuation Fund',
  GOV: 'Commonwealth Government Entity',
  SGE: 'State Government Entity',
  STR: 'Strata-title',
  OIE: 'Other Incorporated Entity',
  UIE: 'Other Unincorporated Entity',
  COP: 'Co-operative',
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
