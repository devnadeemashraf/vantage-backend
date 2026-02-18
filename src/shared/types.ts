export interface SearchQuery {
  term?: string;
  abn?: string;
  state?: string;
  postcode?: string;
  entityType?: string;
  abnStatus?: string;
  page: number;
  limit: number;
  mode?: 'standard' | 'ai';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IngestionResult {
  totalProcessed: number;
  totalInserted: number;
  totalUpdated: number;
  durationMs: number;
}
