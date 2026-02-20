# Vantage Backend — Architecture Deep-Dive

> A comprehensive technical breakdown of the architecture, design decisions, database performance internals, ETL pipeline, and scalability roadmap behind the Vantage B2B Company Search Directory.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Architecture Layers](#2-architecture-layers)
3. [Design Patterns in Detail](#3-design-patterns-in-detail)
4. [Database Performance Deep-Dive](#4-database-performance-deep-dive)
5. [ETL Pipeline Internals](#5-etl-pipeline-internals)
6. [Express 5 & HTTP Layer](#6-express-5--http-layer)
7. [Concurrency Model](#7-concurrency-model)
8. [Testing Strategy](#8-testing-strategy)
9. [Scalability Roadmap](#9-scalability-roadmap)
10. [Configuration & Environment](#10-configuration--environment)

---

## 1. Architecture Overview

Vantage uses a **layered structure** with a clear **dependency direction**: source code dependencies point **inward** — outer layers depend on inner layers, not the other way around. The layout is inspired by layered-architecture ideas, without claiming a strict formal framework.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Interfaces (HTTP)                               │
│  Controllers  ·  Routes  ·  Middleware  ·  Express App              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   Application                               │    │
│  │  Services  ·  Factories  ·  Strategies                      │    │
│  │                                                             │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │                   Domain                            │    │    │
│  │  │  Entities  ·  Interfaces  ·  Value Objects          │    │    │
│  │  │  (zero external dependencies)                       │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Infrastructure                                 │    │
│  │  PostgreSQL Repo  ·  DB Connection  ·  Migrations           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Workers (ETL)                                  │    │
│  │  SAX Parser  ·  Adapter  ·  Batch Processor                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Core                                           │    │
│  │  DI Container  ·  Config  ·  Logger  ·  Tokens              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Shared                                         │    │
│  │  Types  ·  Constants  ·  Custom Errors                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### The Request Lifecycle

A single search request flows through the layers like this:

```
HTTP Request
  │
  ▼
[Express Middleware]  helmet → cors → compression → json → requestLogger
  │
  ▼
[Controller]          Extracts query params, validates pagination bounds
  │
  ▼
[SearchService]       Asks the SearchStrategyFactory for the right algorithm
  │
  ▼
[SearchStrategy]      StandardSearchStrategy delegates to the repository
  │
  ▼
[Repository]          Builds a SQL query with tsvector + pg_trgm scoring
  │
  ▼
[PostgreSQL]          GIN index lookups, rank computation, result return
  │
  ▼
[Repository]          Maps snake_case DB rows → camelCase domain entities
  │
  ▼
[Controller]          Wraps result in { status, data, pagination } JSON
  │
  ▼
HTTP Response
```

---

## 2. Architecture Layers

### 2.1 Domain Layer (`src/domain/`)

The **innermost** layer — pure TypeScript, zero npm dependencies.

| Component | File | Role |
|-----------|------|------|
| `Business` | `entities/Business.ts` | Core data model. Dual interfaces: `Business` (camelCase for app code) and `BusinessRow` (snake_case for PostgreSQL). |
| `BusinessName` | `entities/BusinessName.ts` | 1-to-many value object for trading/legal names associated with a Business. |
| `IBusinessRepository` | `interfaces/IBusinessRepository.ts` | Contract defining WHAT data operations exist, not HOW they're implemented. |
| `ISearchStrategy` | `interfaces/ISearchStrategy.ts` | Contract for search algorithms. Any strategy implements `execute(query)`. |
| `ITextToSqlEngine` | `interfaces/ITextToSqlEngine.ts` | Future AI integration point. Defines `generateSql()` and `isAvailable()`. |
| `IDataSourceAdapter` | `interfaces/IDataSourceAdapter.ts` | Contract for transforming raw external data (XML, JSON) into Business entities. |

**Why the Domain owns the interfaces:** This is the Dependency Inversion Principle (the "D" in SOLID). The domain says "I need search capabilities" — the infrastructure layer provides the implementation. If we migrated from PostgreSQL to Elasticsearch, we'd create a new `ElasticBusinessRepository` implementing the same interface. Every consumer in the application layer remains untouched.

### 2.2 Application Layer (`src/application/`)

Orchestrates use cases by combining domain interfaces and infrastructure.

| Component | File | Pattern | Role |
|-----------|------|---------|------|
| `SearchService` | `services/SearchService.ts` | Facade | Resolves the correct search strategy via the factory, delegates execution. |
| `IngestionService` | `services/IngestionService.ts` | Facade | Spawns an ETL worker thread, forwards progress/result messages back. |
| `SearchStrategyFactory` | `factories/SearchStrategyFactory.ts` | Factory | Maps `mode` string → concrete `ISearchStrategy` implementation. |
| `StandardSearchStrategy` | `strategies/StandardSearchStrategy.ts` | Strategy | Delegates to `repo.search()` or `repo.findWithFilters()` based on whether a search term exists. |

### 2.3 Infrastructure Layer (`src/infrastructure/`)

Concrete implementations of domain interfaces — the layer that talks to external systems.

| Component | File | Pattern | Role |
|-----------|------|---------|------|
| `PostgresBusinessRepository` | `repositories/PostgresBusinessRepository.ts` | Repository | Implements `IBusinessRepository` using Knex + raw PostgreSQL features (tsvector, pg_trgm). |
| `getDbConnection` | `database/connection.ts` | Singleton | Lazy-initializes a Knex connection pool; one pool per OS process. |
| `Migrations 001-003` | `database/migrations/*.ts` | — | Versioned database schema scripts (businesses table, business_names table, search indexes + trigger). |

### 2.4 Interfaces Layer (`src/interfaces/`)

The outermost "delivery mechanism" — how the outside world communicates with the application.

| Component | File | Role |
|-----------|------|------|
| `createApp` | `http/app.ts` | Express application factory. Assembles middleware stack and mounts route groups. |
| `BusinessController` | `http/controllers/BusinessController.ts` | Thin HTTP boundary: extracts params → calls service → sends JSON response. |
| `IngestionController` | `http/controllers/IngestionController.ts` | Triggers ETL via the IngestionService. |
| `businessRoutes` | `http/routes/businessRoutes.ts` | Maps `GET /search` and `GET /:abn` to controller methods. |
| `healthRoutes` | `http/routes/healthRoutes.ts` | `GET /health` liveness probe for load balancers. |
| `ingestionRoutes` | `http/routes/ingestionRoutes.ts` | `POST /ingest` for programmatic ETL triggers. |
| `errorHandler` | `http/middleware/errorHandler.ts` | Global catch-all: operational errors → proper status codes; programmer errors → generic 500. |
| `requestLogger` | `http/middleware/requestLogger.ts` | Wraps Pino HTTP plugin for per-request structured logging. |

### 2.5 Core Layer (`src/core/`)

Cross-cutting infrastructure that every layer depends on.

| Component | File | Role |
|-----------|------|------|
| `config` | `config.ts` | Zod-validated environment variables with coercion and defaults. Crashes at startup on invalid config. |
| `logger` | `logger.ts` | Pino structured logger. JSON in production, pretty-printed in development. |
| `TOKENS` | `types.ts` | DI injection tokens (Symbols) grouped by architectural layer. |
| `container` | `container.ts` | tsyringe DI container — the central wiring point where tokens are bound to implementations. |

### 2.6 Shared Layer (`src/shared/`)

Types, constants, and utilities consumed across all layers.

| Component | File | Role |
|-----------|------|------|
| `SearchQuery` / `PaginatedResult` / `IngestionResult` | `types.ts` | Data transfer shapes that flow between controller → service → repository. |
| `AppError` hierarchy | `errors/AppError.ts` | Operational vs programmer error distinction with auto-status-codes (`NotFoundError`=404, `ValidationError`=400, `ConflictError`=409). |
| Constants | `constants.ts` | ABR reference codes, pagination bounds (`DEFAULT_PAGE_SIZE`=20, `MAX_PAGE_SIZE`=100). |

---

## 3. Design Patterns in Detail

### 3.1 Dependency Injection (tsyringe)

**Problem:** Classes need collaborators (logger, database, repositories), but hard-coding `new PostgresBusinessRepository(...)` creates tight coupling.

**Solution:** Every dependency is registered in `container.ts` against a Symbol token. Classes declare what they need via `@inject(TOKENS.Xyz)` decorators, and tsyringe resolves them at construction time.

```
container.register(TOKENS.BusinessRepository, { useClass: PostgresBusinessRepository });
                     ▲                                           ▲
                  Token (name badge)                     Concrete class
```

**Benefit:** Swapping implementations requires changing ONE line in `container.ts`. Tests can register mock implementations against the same tokens.

**Technical requirement:** `reflect-metadata` must be imported before any `@injectable()`/`@inject()` decorator executes, because tsyringe reads constructor parameter metadata that TypeScript's `emitDecoratorMetadata` compiler flag generates at compile time.

### 3.2 Repository Pattern

**Problem:** Business logic shouldn't contain SQL queries — it makes the code untestable and couples it to a specific database.

**Solution:** `IBusinessRepository` defines the contract (WHAT); `PostgresBusinessRepository` provides the implementation (HOW).

```
Domain:          IBusinessRepository { search(query): Promise<PaginatedResult> }
                        ▲
                        │ implements
                        │
Infrastructure:  PostgresBusinessRepository { search(query) { ...Knex + raw SQL... } }
```

**Benefit:** The Application layer calls `repo.search()` without knowing it's PostgreSQL under the hood. Unit tests mock the interface entirely.

### 3.3 Strategy Pattern

**Problem:** Search might be implemented by different algorithms (standard text search, AI-powered natural language search). Hard-coding `if (mode === 'standard')` logic inside the service violates the Open/Closed Principle.

**Solution:** Each algorithm implements `ISearchStrategy.execute()`. The `SearchStrategyFactory` maps mode → strategy. Adding a new search mode means adding a new class and one `case` statement — existing strategies are never modified.

```
                ISearchStrategy
                  ▲         ▲
                  │         │
  StandardSearchStrategy   AiSearchStrategy (future)
```

### 3.4 Adapter Pattern

**Problem:** Raw XML data from the Australian Business Register has a completely different structure than our `Business` domain entity. Different data sources (XML, JSON, CSV) would each have their own format.

**Solution:** `XmlDataSourceAdapter` implements `IDataSourceAdapter<RawAbrRecord>` and handles all format-specific normalization: entity type branching (IND vs non-IND), date format parsing (YYYYMMDD strings with `19000101` sentinel), and name assembly.

```
RawAbrRecord (XML-shaped) ──→ XmlDataSourceAdapter.normalize() ──→ Business (domain-shaped)
```

**Benefit:** The ETL pipeline (`batchProcessor`, `etlWorker`) never touches XML-specific logic. A future JSON API source would only need a `JsonDataSourceAdapter`.

### 3.5 Factory Pattern

**Problem:** The `SearchService` shouldn't decide which strategy to instantiate — that's a separate responsibility.

**Solution:** `SearchStrategyFactory.create(mode)` encapsulates the construction logic. The factory receives the repository via DI and passes it to whichever strategy it constructs.

### 3.6 Facade Pattern

**Problem:** The ETL subsystem involves worker thread spawning, message passing, file system access, and database operations. The HTTP controller shouldn't orchestrate all of that.

**Solution:** `IngestionService.ingest(filePath)` hides the complexity behind a single method call — like a car's ignition button that starts the engine, fuel pump, and electronics simultaneously.

### 3.7 Singleton Pattern

**Problem:** Database connections are expensive resources (TCP handshake, authentication, SSL negotiation). Creating one per query would be catastrophically slow.

**Solution:** `getDbConnection()` in `connection.ts` uses a module-level `instance` variable. The first call creates the Knex pool; subsequent calls return the same instance. In a clustered deployment, each OS process gets its own singleton (processes don't share memory).

---

## 4. Database Performance Deep-Dive

This is where Vantage achieves fast search across hundreds of thousands of business records. Three PostgreSQL features work together:

### 4.1 pg_trgm — Trigram Fuzzy Matching

**What it does:** The `pg_trgm` extension decomposes strings into overlapping 3-character substrings called **trigrams**.

```
"Plumbing" → {" Pl", "Plu", "lum", "umb", "mbi", "bin", "ing", "ng "}
"Plumbng"  → {" Pl", "Plu", "lum", "umb", "mbn", "bng", "ng "}
```

The `similarity()` function computes how many trigrams two strings share, returning a value between 0.0 (no overlap) and 1.0 (identical). "Plumbing" vs "Plumbng" might return ~0.7 — high enough to qualify as a match.

**Why this matters:** Users frequently misspell search terms. Traditional `LIKE` or `=` operators would return zero results for "Plumbng". Trigram matching provides **typo-tolerant search** without any external fuzzy search library.

**Threshold:** Vantage uses `SIMILARITY_THRESHOLD = 0.3` — a row must share at least 30% of its trigrams with the search term to be included. This is intentionally permissive; the ranking system (Section 4.3) ensures the best matches appear first.

### 4.2 tsvector & to_tsquery — Full-Text Search

**What it does:** PostgreSQL's built-in full-text search engine pre-processes text into a **tsvector** — a sorted list of normalized words (lexemes) with position information.

```sql
to_tsvector('english', 'Smith''s Plumbing Services') → 'plumb':2 'servic':3 'smith':1
```

Key transformations:
- **Stemming:** "Plumbing" → "plumb", "Services" → "servic". Searching for "plumber" matches because it also stems to "plumb".
- **Stop word removal:** Common words like "the", "a", "is" are discarded — they add noise without improving relevance.
- **Position tracking:** Each lexeme records its position (1st word, 2nd word...), enabling proximity ranking.

**The `search_vector` column:** Instead of computing `to_tsvector()` at query time (slow — would scan every row), Vantage stores a pre-computed tsvector in a dedicated column. This column is **automatically maintained** by a database trigger (see Section 4.4).

**Weighted fields:** The trigger concatenates multiple fields with different relevance weights:

```sql
setweight(to_tsvector('english', entity_name), 'A')   -- Weight A (highest)
setweight(to_tsvector('english', given_name),  'B')    -- Weight B
setweight(to_tsvector('english', family_name), 'B')    -- Weight B
setweight(to_tsvector('english', state),       'C')    -- Weight C (lowest)
setweight(to_tsvector('english', postcode),    'C')    -- Weight C
```

When `ts_rank()` computes relevance, a match on the entity name (A) scores higher than a match on the state (C).

### 4.3 Relevance Scoring — Blended Ranking

Vantage doesn't use either search method alone. The repository blends both into a single relevance score:

```sql
(0.6 * ts_rank(search_vector, to_tsquery('english', ?), 32)
 + 0.4 * similarity(entity_name, ?)) AS relevance
```

| Component | Weight | Strength |
|-----------|--------|----------|
| `ts_rank` (full-text) | 60% | Linguistic matching — understands word stems, handles multi-word queries, respects field weights. |
| `similarity` (trigram) | 40% | Character-level matching — catches typos, partial names, abbreviations. |

The `32` flag in `ts_rank(..., 32)` normalizes the rank by document length, preventing longer entity names from automatically scoring higher.

**Result matching uses `OR` logic:**

```sql
WHERE search_vector @@ to_tsquery('english', ?)   -- Full-text match
   OR similarity(entity_name, ?) > 0.3            -- OR fuzzy match
```

This ensures that a query like "plumbng sydney" still returns results — the tsvector catches "sydney" via stemming, while pg_trgm catches "plumbng" via trigram similarity.

### 4.4 GIN Indexes — The Speed Multiplier

**Problem:** Without indexes, both `@@` (tsvector match) and `similarity()` would require a **sequential scan** of every row — O(n). With 800,000+ rows, that's unacceptably slow.

**Solution:** GIN (Generalized Inverted Index) creates a reverse mapping: **token → list of row IDs that contain it**.

Think of the index at the back of a textbook:

```
"plumb" → rows [142, 5891, 23004, 78112, ...]
"smith" → rows [7, 2104, 8832, ...]
```

Instead of reading every row to check if it contains "plumb", PostgreSQL looks up the GIN index and immediately gets the matching row IDs — turning O(n) into O(log n).

**Three GIN indexes are created:**

| Index | Column | Operator Class | Purpose |
|-------|--------|----------------|---------|
| `idx_businesses_search_vector` | `search_vector` | (default tsvector) | Accelerates `@@` full-text queries. |
| `idx_businesses_entity_name_trgm` | `entity_name` | `gin_trgm_ops` | Accelerates `similarity()` and `%` trigram queries. |
| `idx_business_names_name_text_trgm` | `name_text` | `gin_trgm_ops` | Enables fuzzy search on trading/business names. |

**Plus four B-tree indexes** for equality filter acceleration:

| Index | Column | Use Case |
|-------|--------|----------|
| `idx_businesses_abn_status` | `abn_status` | `WHERE abn_status = 'ACT'` |
| `idx_businesses_entity_type` | `entity_type_code` | `WHERE entity_type_code = 'PRV'` |
| `idx_businesses_state` | `state` | `WHERE state = 'NSW'` |
| `idx_businesses_postcode` | `postcode` | `WHERE postcode = '2000'` |

### 4.5 Database Trigger — Automatic tsvector Maintenance

A trigger is a stored procedure that fires automatically on specified events. Vantage's trigger fires **BEFORE INSERT OR UPDATE** on every business row:

```sql
CREATE TRIGGER trg_businesses_search_vector
BEFORE INSERT OR UPDATE ON businesses
FOR EACH ROW
EXECUTE FUNCTION businesses_search_vector_trigger()
```

The trigger function recomputes `search_vector` from the current field values with appropriate weights. This means:

- **Inserts:** The search vector is populated immediately — no separate update needed.
- **Updates:** If the entity name or state changes, the search vector is automatically refreshed.
- **No application code required:** The application never manually manages the tsvector column. It simply inserts/updates rows, and PostgreSQL handles the rest.

### 4.6 Schema Design Decisions

**Separate `business_names` table:** The 1-to-many relationship between businesses and their trading/alternate names is normalized into a separate table with a foreign key and `ON DELETE CASCADE`. This avoids storing a JSON array in the businesses table, which would:
- Bloat the row size (every query would fetch all names even when not needed).
- Make it impossible to index individual names with pg_trgm.
- Complicate updates when a single name changes.

**UNIQUE constraint on `abn`:** Enables `ON CONFLICT (abn) MERGE` for idempotent upserts during ETL — re-running the seed doesn't create duplicates.

**Column sizing:** `abn` is `VARCHAR(11)` (ABN spec), `entity_type_code` is `VARCHAR(4)`, `state` is `VARCHAR(3)`. Tight sizing reduces storage per row and keeps index pages small, improving cache hit rates.

---

## 5. ETL Pipeline Internals

The ETL (Extract-Transform-Load) pipeline ingests ABR XML datasets (580MB–620MB each) into PostgreSQL. It runs entirely outside the HTTP server process.

### 5.1 Pipeline Architecture

```
XML File on Disk
      │
      ▼
FileReadStream (64KB highWaterMark)
      │
      ▼ (pipe)
SAX Parser (event-driven, constant memory)
      │
      ├── opentag → push to elementStack, read attributes
      ├── text    → accumulate into currentText
      └── closetag → assign value, pop elementStack
                     │
                     ▼ (on </ABR> close)
         XmlDataSourceAdapter.normalize()
                     │
                     ▼
         BatchProcessor.add(entity)
                     │
                     ▼ (when buffer reaches batchSize)
         BatchProcessor.flush()
                     │
                     ├── Phase 1: Chunked INSERT...ON CONFLICT MERGE (businesses)
                     ├── Phase 2: Collect business_names from batch
                     ├── Phase 3: Fetch DB-assigned IDs for upserted ABNs
                     ├── Phase 4: DELETE existing names (idempotent re-run)
                     └── Phase 5: INSERT fresh business_names
```

### 5.2 SAX Streaming — Why Not DOM?

| Approach | Memory | Speed | Suitability |
|----------|--------|-------|-------------|
| **DOM Parser** (load entire XML into memory) | ~2-3GB for 580MB file | Must parse everything before processing begins | Unsuitable — would OOM on most machines. |
| **SAX Parser** (event-driven stream) | ~64KB buffer (constant) | Processes records as they're parsed | Ideal for large datasets. |

SAX reads the XML file like a conveyor belt — one tag at a time. Three events drive all logic:

1. **`opentag`**: A new XML element opens. We push its name onto `elementStack` (breadcrumb trail) and read any attributes (e.g., `ABN`'s `status` attribute).
2. **`text`**: Character data between tags. We accumulate into `currentText`.
3. **`closetag`**: An element closes. We assign `currentText` to the correct field on the current record (using `elementStack` for parent context), then pop the stack.

The `elementStack` is critical because the same tag name (e.g., `NonIndividualNameText`) can appear under different parent elements (`MainEntity` vs `OtherEntity`). The grandparent element disambiguates:

```xml
<MainEntity>
  <NonIndividualName>
    <NonIndividualNameText>Smith Holdings Pty Ltd</NonIndividualNameText>  ← entity_name
  </NonIndividualName>
</MainEntity>

<OtherEntity>
  <NonIndividualName type="TRD">
    <NonIndividualNameText>Smith's Plumbing</NonIndividualNameText>       ← business_name
  </NonIndividualName>
</OtherEntity>
```

### 5.3 Batch Processing & PostgreSQL Parameter Limits

**The batch buffer:** Instead of issuing one `INSERT` per record (~800,000 individual queries), the `BatchProcessor` accumulates records in a buffer and flushes every `batchSize` (default: 5,000 rows) records.

**PostgreSQL's 65,535 parameter limit:** Each parameterized value in a prepared statement counts as one "bind parameter". A single business row has 14 columns, so:

```
5,000 rows × 14 columns = 70,000 parameters > 65,535 limit
```

This causes the cryptic error: `bind message has 70000 parameter formats but 0 parameters`.

**Solution — Sub-batch chunking:** The flush method calculates the maximum rows per INSERT:

```typescript
const MAX_ROWS_PER_INSERT = Math.floor(65535 / 14); // = 4,681 rows
```

Rows are inserted in chunks of 4,681, each staying safely within PostgreSQL's limit.

### 5.4 Upsert Strategy (ON CONFLICT...MERGE)

```sql
INSERT INTO businesses (abn, abn_status, ...)
VALUES (...)
ON CONFLICT (abn) MERGE
```

This single statement handles both new records AND updates:
- If the ABN doesn't exist → `INSERT` a new row.
- If the ABN already exists → `UPDATE` the existing row with the new values.

**Benefit:** Re-running the seed on the same dataset doesn't create duplicates. Running it on an updated dataset picks up changes. This is **idempotent ingestion**.

### 5.5 Business Names — Idempotent Re-run

For child rows (business_names), the strategy is **delete-and-reinsert**:

1. Fetch the database-assigned `id` values for the ABNs just upserted.
2. Delete all existing `business_names` rows for those IDs.
3. Insert the fresh names from the current batch.

This ensures that name changes, additions, or removals in a new dataset version are correctly reflected without orphaned rows.

### 5.6 Worker Thread Isolation

The ETL worker runs in a **separate V8 isolate** via `worker_threads`. This is not just threading — it's a separate JavaScript runtime with its own:

- Heap memory
- Event loop
- Module cache
- Global scope

**Consequence:** TCP sockets (including database connections) cannot cross the isolate boundary. That's why the `BatchProcessor` creates its own Knex connection pool (`min: 1, max: 3`) independently from the HTTP server's pool.

**Communication:** The worker and main thread exchange messages via `postMessage()`:

| Direction | Message Type | Data |
|-----------|-------------|------|
| Main → Worker | `workerData` | `{ filePath, dbConfig, batchSize }` |
| Worker → Main | `progress` | `{ processed: number }` (every 10,000 records) |
| Worker → Main | `done` | `{ totalProcessed, totalInserted, totalUpdated, durationMs }` |
| Worker → Main | `error` | `{ message: string }` |

---

## 6. Express 5 & HTTP Layer

### 6.1 Express 5 Async Error Handling

Express 4 required every async route handler to wrap its body in `try/catch` and call `next(err)` — forgetting this caused unhandled promise rejections and silent failures.

**Express 5 natively catches rejected promises:**

```typescript
// Express 5 — just throw or let the promise reject
router.get('/search', async (req, res) => {
  const result = await service.search(query); // If this throws...
  res.json(result);
  // Express 5 catches the rejection and forwards to errorHandler automatically
});
```

This eliminates an entire class of bugs and reduces boilerplate.

### 6.2 Middleware Stack (Order Matters)

Middleware executes in registration order — like an assembly line:

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | `helmet()` | Sets security headers (CSP, X-Frame-Options, HSTS, etc.) |
| 2 | `cors()` | Allows cross-origin requests from frontend apps |
| 3 | `compression()` | Gzips response bodies (typical 70-90% size reduction for JSON) |
| 4 | `express.json()` | Parses JSON request bodies into `req.body` |
| 5 | `requestLogger` | Pino-based structured logging of every request/response with timing |
| 6 | Routes | The actual API endpoints |
| 7 | `errorHandler` | **Must be last** — catches errors from all routes above |

### 6.3 Error Handling Strategy

The custom error hierarchy in `AppError.ts` distinguishes:

| Error Type | Status Code | `isOperational` | Client Response |
|------------|-------------|------------------|-----------------|
| `NotFoundError` | 404 | `true` | Error message sent to client |
| `ValidationError` | 400 | `true` | Error message sent to client |
| `ConflictError` | 409 | `true` | Error message sent to client |
| `AppError` (generic) | any | `true` | Error message sent to client |
| Unexpected `Error` | 500 | N/A | Generic "Internal server error" (never leaks internals) |

### 6.4 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Liveness probe (uptime, timestamp) |
| `GET` | `/api/v1/businesses/search` | Full-text + fuzzy search with filters and pagination |
| `GET` | `/api/v1/businesses/:abn` | Single business lookup by ABN (includes business_names) |
| `POST` | `/api/v1/ingest` | Trigger ETL ingestion of an XML file |

**Search query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | — | Search term (full-text + fuzzy) |
| `state` | string | — | Filter by Australian state code |
| `postcode` | string | — | Filter by postcode |
| `entityType` | string | — | Filter by entity type code (IND, PRV, etc.) |
| `abnStatus` | string | — | Filter by ABN status (ACT, CAN) |
| `page` | number | 1 | Page number (1-indexed) |
| `limit` | number | 20 | Results per page (max: 100) |
| `mode` | string | `standard` | Search mode: `standard` or `ai` (future) |

---

## 7. Concurrency Model

### 7.1 Cluster Module — Multi-Process HTTP

Node.js is single-threaded — one process uses one CPU core. On a 4-core machine, a single process leaves 75% of CPU capacity idle.

**Solution:** `server.ts` uses Node.js's built-in `cluster` module:

```
┌─────────────────────────────────────────────────────────┐
│                   Primary Process                        │
│  - Forks N worker processes (N = CPU cores)              │
│  - Monitors workers; auto-restarts on crash              │
│  - Does NOT serve HTTP requests                          │
└─────────────┬──────────┬──────────┬──────────┬──────────┘
              │          │          │          │
         ┌────▼───┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐
         │Worker 1│ │Worker 2│ │Worker 3│ │Worker 4│
         │ :3000  │ │ :3000  │ │ :3000  │ │ :3000  │
         │ pool   │ │ pool   │ │ pool   │ │ pool   │
         └────────┘ └────────┘ └────────┘ └────────┘
```

All workers bind to the **same port** — the OS kernel distributes incoming connections across them (round-robin on Linux, random on Windows/macOS). Each worker runs its own Express app with its own DB connection pool.

### 7.2 Graceful Shutdown

On `SIGTERM` or `SIGINT`, each worker:

1. **Stops accepting** new connections (`server.close()`).
2. **Drains** in-flight requests — existing connections finish normally.
3. **Destroys** the database connection pool (releases connections back to PostgreSQL).
4. **Exits** with code 0.

This prevents request failures during deployment rollouts.

### 7.3 Worker Threads vs Cluster Processes

| Concern | Cluster (HTTP) | Worker Threads (ETL) |
|---------|---------------|---------------------|
| **Purpose** | Parallel HTTP request handling | CPU-intensive XML parsing |
| **Isolation** | Separate OS processes (separate memory) | Separate V8 isolates (shared process, separate heap) |
| **Communication** | IPC via `process.send()` | `postMessage()` / `workerData` |
| **DB connections** | Own pool per process | Own pool per worker thread |
| **When used** | Always (production server) | On-demand (seed script or ingest endpoint) |

---

## 8. Testing Strategy

### 8.1 Test Architecture

```
src/__tests__/
├── helpers/
│   ├── fixtures.ts          # Reusable test data (sample businesses, queries)
│   └── mockRepository.ts    # Factory for mock IBusinessRepository
├── unit/
│   ├── AppError.unit.test.ts
│   ├── SearchService.unit.test.ts
│   ├── SearchStrategyFactory.unit.test.ts
│   └── XmlDataSourceAdapter.unit.test.ts
├── integration/
│   ├── health.integration.test.ts
│   └── business.integration.test.ts
└── jest.setup.ts             # Global: imports reflect-metadata for tsyringe
```

### 8.2 Unit Tests

Unit tests mock all external dependencies and test a single class in isolation:

- **`AppError`** — Verifies `statusCode`, `isOperational`, `instanceof` chains, and stack traces for all error subclasses.
- **`XmlDataSourceAdapter`** — Tests normalization of individual vs company records, sentinel date handling (`19000101` → `null`), and `otherNames` mapping.
- **`SearchStrategyFactory`** — Confirms correct strategy instantiation for `standard`, 501 for `ai`, 400 for unknown modes.
- **`SearchService`** — Verifies delegation to factory-created strategies and `NotFoundError` on missing ABN lookups.

### 8.3 Integration Tests

Integration tests exercise the full HTTP stack (middleware → routes → controllers → services) with a mock repository injected via the DI container:

- **Health endpoint** — Verifies 200 OK, JSON content type, and presence of `uptime`/`timestamp` fields.
- **Business endpoints** — Tests search with pagination, empty results, filter-only queries, ABN lookup success, and 404 on missing ABN.

The DI override technique in integration tests:

```typescript
beforeAll(async () => {
  await import('@core/container');                                    // Bootstrap DI
  container.register(TOKENS.BusinessRepository, { useValue: mock }); // Override with mock
  const { createApp } = await import('@interfaces/http/app');        // Now build the app
  app = createApp();
});
```

This ensures the mock is in place before any service resolves the repository token.

### 8.4 Coverage & Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm test` | `jest` | Run all tests |
| `npm run test:unit` | `jest --testPathPatterns=unit` | Unit tests only |
| `npm run test:integration` | `jest --testPathPatterns=integration` | Integration tests only |
| `npm run test:coverage` | `jest --coverage` | Full run with coverage report |

---

## 9. Scalability Roadmap

The current prototype handles a single 580MB XML file (~800,000 records). Here's how to scale to **20 files (12GB+, 16M+ rows)** while maintaining fast search and API responsiveness.

### 9.1 Data Ingestion at Scale

| Bottleneck | Current Approach | Scaled Approach |
|------------|-----------------|-----------------|
| **Single-file processing** | One worker thread processes one XML file | **Parallel workers:** Spawn one worker per file (up to CPU core count). Each worker gets its own connection pool. |
| **Batch size** | 5,000 rows per flush | Tune dynamically based on row width. Profile with `EXPLAIN ANALYZE` to find the sweet spot (typically 2,000–10,000). |
| **Trigger overhead** | tsvector trigger fires on every INSERT/UPDATE | **Disable trigger during bulk load**, rebuild tsvector in a single `UPDATE` afterward. This can cut ingestion time by 30-50%. |
| **Index overhead** | GIN indexes maintained incrementally | **Drop indexes before load, rebuild after.** Incremental GIN updates are slower than building from scratch. |
| **Transaction wrapping** | Each batch is auto-committed | Wrap batches in explicit transactions for fewer WAL (write-ahead log) flushes. |

**Example optimized seed flow:**

```
1. DROP INDEX (GIN indexes)
2. DISABLE TRIGGER on businesses
3. Parallel ingest: N workers × M files
4. ENABLE TRIGGER
5. UPDATE businesses SET search_vector = ... (single pass)
6. CREATE INDEX CONCURRENTLY (non-blocking rebuild)
7. VACUUM ANALYZE businesses
```

### 9.2 Query Performance at Scale (16M+ rows)

| Technique | Impact | Implementation |
|-----------|--------|----------------|
| **Table partitioning** | Partition `businesses` by `state` (9 partitions). Queries filtering by state only scan the relevant partition. | `CREATE TABLE businesses (...) PARTITION BY LIST (state)` |
| **Materialized views** | Pre-compute common aggregations (count by state, entity type distribution) to avoid full table scans. | `CREATE MATERIALIZED VIEW biz_state_counts AS SELECT state, COUNT(*) ...` with `REFRESH MATERIALIZED VIEW CONCURRENTLY`. |
| **Connection pooling (PgBouncer)** | With 20 cluster workers × 10 connections each = 200 connections. PgBouncer multiplexes these down to ~30 actual PostgreSQL connections. | Deploy PgBouncer in `transaction` pooling mode between the app and PostgreSQL. |
| **Read replicas** | Offload search queries to read replicas; primary handles only writes (ingestion). | PostgreSQL streaming replication with application-level read/write splitting. |
| **Redis caching** | Cache frequently searched terms and their result sets (TTL: 5-30 minutes). Reduces database load for popular queries. | `ioredis` + cache-aside pattern in the repository or a caching middleware. |
| **Partial indexes** | If most queries target active businesses, create partial indexes: `WHERE abn_status = 'ACT'`. Smaller index = faster lookups. | `CREATE INDEX idx_active_biz_search ON businesses USING GIN (search_vector) WHERE abn_status = 'ACT'` |

### 9.3 Application-Level Scaling

| Technique | Impact |
|-----------|--------|
| **Rate limiting** | Prevent abuse with `express-rate-limit` (e.g., 100 req/min per IP). |
| **Request queuing** | For ingestion requests, push jobs to a message queue (BullMQ + Redis) instead of spawning workers synchronously. Prevents resource exhaustion under concurrent ingest requests. |
| **Horizontal scaling** | Deploy multiple application instances behind a load balancer (Nginx, AWS ALB). Each instance runs its own cluster of workers. |
| **Health check readiness** | Add a `/health/ready` endpoint that pings the database. Load balancers should use this for traffic routing (not just the `/health` liveness check). |
| **Response compression** | Already in place (`compression` middleware). For very large result sets, consider streaming JSON responses (`res.write()` in chunks). |

### 9.4 Database Tuning for Large Datasets

| PostgreSQL Setting | Default | Recommended for 16M+ rows | Why |
|--------------------|---------|---------------------------|-----|
| `shared_buffers` | 128MB | 25% of RAM (e.g., 4GB on 16GB server) | Larger buffer cache = more data served from memory. |
| `effective_cache_size` | 4GB | 75% of RAM (e.g., 12GB) | Helps the query planner prefer index scans over sequential scans. |
| `work_mem` | 4MB | 64–256MB | Allows in-memory sorting and hashing for complex queries. |
| `maintenance_work_mem` | 64MB | 1–2GB | Speeds up `CREATE INDEX`, `VACUUM`, and bulk ingestion. |
| `max_connections` | 100 | 200–300 (or use PgBouncer) | Support more cluster workers. |
| `random_page_cost` | 4.0 | 1.1 (SSD) | Tells the planner that random I/O is nearly as fast as sequential on SSDs. |
| `wal_level` | `replica` | `minimal` (during bulk load only) | Reduces WAL generation during ingestion. Reset to `replica` after. |

### 9.5 Future AI Integration Path

The architecture is pre-wired for a Text-to-SQL engine:

```
User: "plumbing companies in Sydney registered after 2020"
         │
         ▼
  AiSearchStrategy.execute(query)
         │
         ▼
  ITextToSqlEngine.generateSql(query.term)
         │
         ▼
  "SELECT * FROM businesses WHERE entity_name ILIKE '%plumbing%'
   AND state = 'NSW' AND abn_status_from > '2020-01-01'"
         │
         ▼
  Repository executes raw SQL → returns PaginatedResult
```

**Possible engine implementations:**
- **OpenAI GPT-4** with schema-aware prompting (send table DDL + column descriptions)
- **SQLCoder** (open-source, self-hosted, fine-tuned for SQL generation)
- **Rule-based parser** for common patterns (no LLM cost, fastest latency)

The `SearchStrategyFactory` already has the `'ai'` case — it just needs a real `AiSearchStrategy` and a `ITextToSqlEngine` implementation wired into the DI container.

---

## 10. Configuration & Environment

### 10.1 Zod-Validated Environment

Every environment variable is validated at startup through a Zod schema in `config.ts`. Invalid or missing variables cause an immediate crash with a clear error message — failing fast is always better than failing mysteriously at runtime.

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `PORT` | number | 3000 | HTTP server port |
| `NODE_ENV` | enum | development | Environment mode |
| `DB_HOST` | string | localhost | PostgreSQL host |
| `DB_PORT` | number | 5432 | PostgreSQL port |
| `DB_NAME` | string | vantage | Database name |
| `DB_USER` | string | postgres | Database user |
| `DB_PASSWORD` | string | (empty) | Database password |
| `DB_POOL_MIN` | number | 2 | Minimum pool connections |
| `DB_POOL_MAX` | number | 10 | Maximum pool connections |
| `WEB_CONCURRENCY` | number | 0 (= CPU count) | Number of cluster workers |
| `LOG_LEVEL` | enum | info | Pino log level |
| `ETL_BATCH_SIZE` | number | 5000 | Records per batch flush |
| `ETL_DATA_DIR` | string | ./temp | Directory containing XML data files |

### 10.2 Code Quality Tooling

| Tool | Purpose | Config File |
|------|---------|-------------|
| **TypeScript** (`strict: true`) | Static type checking with no implicit `any`, strict null checks, unused variable detection | `tsconfig.json` |
| **ESLint 10** (flat config) | Linting with `typescript-eslint` rules | `eslint.config.mjs` |
| **Prettier** | Opinionated code formatting | `.prettierrc` |
| **eslint-plugin-simple-import-sort** | Deterministic import ordering | Configured in `eslint.config.mjs` |
| **Husky** | Git hooks manager | `.husky/pre-commit`, `.husky/pre-push` |
| **lint-staged** | Pre-commit: run ESLint + Prettier only on staged `.ts` files | `package.json` → `lint-staged` |
| **Jest + ts-jest** | Testing framework with TypeScript support | `jest.config.js` |
| **Supertest** | HTTP assertion library for integration tests | Used in `*.integration.test.ts` |

### 10.3 Path Aliases

```json
{
  "@core/*":           "src/core/*",
  "@domain/*":         "src/domain/*",
  "@infrastructure/*": "src/infrastructure/*",
  "@application/*":    "src/application/*",
  "@interfaces/*":     "src/interfaces/*",
  "@workers/*":        "src/workers/*",
  "@shared/*":         "src/shared/*"
}
```

Configured in `tsconfig.json` for TypeScript compilation, `jest.config.js` for test resolution, and resolved at build time by `tsc-alias` (post-compilation path rewriting).

---

*This document reflects the architecture as of Commit 12. It will be updated as the AI search abstraction (Commit 13) is integrated.*
