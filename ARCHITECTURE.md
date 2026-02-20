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
[SearchStrategy]      NativeSearchStrategy or OptimizedSearchStrategy (by technique)
  │
  ▼
[Repository]          searchNative (ILIKE) or searchOptimized (tsvector @@)
  │
  ▼
[PostgreSQL]          Seq scan (native) or GIN index lookup (optimized)
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

| Component             | File                                | Role                                                                                                                 |
| --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Business`            | `entities/Business.ts`              | Core data model. Dual interfaces: `Business` (camelCase for app code) and `BusinessRow` (snake_case for PostgreSQL). |
| `BusinessName`        | `entities/BusinessName.ts`          | 1-to-many value object for trading/legal names associated with a Business.                                           |
| `IBusinessRepository` | `interfaces/IBusinessRepository.ts` | Contract defining WHAT data operations exist, not HOW they're implemented.                                           |
| `ISearchStrategy`     | `interfaces/ISearchStrategy.ts`     | Contract for search algorithms. Any strategy implements `execute(query)`.                                            |
| `ITextToSqlEngine`    | `interfaces/ITextToSqlEngine.ts`    | Future AI integration point. Defines `generateSql()` and `isAvailable()`.                                            |
| `IDataSourceAdapter`  | `interfaces/IDataSourceAdapter.ts`  | Contract for transforming raw external data (XML, JSON) into Business entities.                                      |

**Why the Domain owns the interfaces:** This is the Dependency Inversion Principle (the "D" in SOLID). The domain says "I need search capabilities" — the infrastructure layer provides the implementation. If we migrated from PostgreSQL to Elasticsearch, we'd create a new `ElasticBusinessRepository` implementing the same interface. Every consumer in the application layer remains untouched.

### 2.2 Application Layer (`src/application/`)

Orchestrates use cases by combining domain interfaces and infrastructure.

| Component                 | File                                    | Pattern  | Role                                                                                                  |
| ------------------------- | --------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `SearchService`           | `services/SearchService.ts`             | Facade   | Resolves the correct search strategy via the factory, delegates execution.                            |
| `IngestionService`        | `services/IngestionService.ts`          | Facade   | Spawns an ETL worker thread, forwards progress/result messages back.                                  |
| `SearchStrategyFactory`   | `factories/SearchStrategyFactory.ts`    | Factory  | Maps `query.technique` (and `query.mode` for AI) → concrete `ISearchStrategy`.                        |
| `NativeSearchStrategy`    | `strategies/NativeSearchStrategy.ts`    | Strategy | Uses `repo.searchNative()` (ILIKE) or `repo.findWithFilters()` — baseline for performance comparison. |
| `OptimizedSearchStrategy` | `strategies/OptimizedSearchStrategy.ts` | Strategy | Uses `repo.searchOptimized()` (tsvector @@) or `repo.findWithFilters()` — index-backed, low latency.  |

### 2.3 Infrastructure Layer (`src/infrastructure/`)

Concrete implementations of domain interfaces — the layer that talks to external systems.

| Component                    | File                                         | Pattern    | Role                                                                                                                                            |
| ---------------------------- | -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostgresBusinessRepository` | `repositories/PostgresBusinessRepository.ts` | Repository | Implements `IBusinessRepository`: `searchNative()` (ILIKE), `searchOptimized()` (tsvector @@), `findWithFilters()`, plus ETL and lookup.        |
| `getDbConnection`            | `database/connection.ts`                     | Singleton  | Lazy-initializes a Knex connection pool; one pool per OS process.                                                                               |
| `Migrations 001-003`         | `database/migrations/*.ts`                   | —          | 001: businesses (with search_vector column); 002: business_names; 003: trigger to maintain search_vector, backfill, GIN index on search_vector. |

### 2.4 Interfaces Layer (`src/interfaces/`)

The outermost "delivery mechanism" — how the outside world communicates with the application.

| Component             | File                                      | Role                                                                                         |
| --------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `createApp`           | `http/app.ts`                             | Express application factory. Assembles middleware stack and mounts route groups.             |
| `BusinessController`  | `http/controllers/BusinessController.ts`  | Thin HTTP boundary: extracts params → calls service → sends JSON response.                   |
| `IngestionController` | `http/controllers/IngestionController.ts` | Triggers ETL via the IngestionService.                                                       |
| `businessRoutes`      | `http/routes/businessRoutes.ts`           | Maps `GET /search` and `GET /:abn` to controller methods.                                    |
| `healthRoutes`        | `http/routes/healthRoutes.ts`             | `GET /health` liveness probe for load balancers.                                             |
| `ingestionRoutes`     | `http/routes/ingestionRoutes.ts`          | `POST /ingest` for programmatic ETL triggers.                                                |
| `errorHandler`        | `http/middleware/errorHandler.ts`         | Global catch-all: operational errors → proper status codes; programmer errors → generic 500. |
| `requestLogger`       | `http/middleware/requestLogger.ts`        | Wraps Pino HTTP plugin for per-request structured logging.                                   |

### 2.5 Core Layer (`src/core/`)

Cross-cutting infrastructure that every layer depends on.

| Component   | File           | Role                                                                                                  |
| ----------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `config`    | `config.ts`    | Zod-validated environment variables with coercion and defaults. Crashes at startup on invalid config. |
| `logger`    | `logger.ts`    | Pino structured logger. JSON in production, pretty-printed in development.                            |
| `TOKENS`    | `types.ts`     | DI injection tokens (Symbols) grouped by architectural layer.                                         |
| `container` | `container.ts` | tsyringe DI container — the central wiring point where tokens are bound to implementations.           |

### 2.6 Shared Layer (`src/shared/`)

Types, constants, and utilities consumed across all layers.

| Component                                             | File                 | Role                                                                                                                                  |
| ----------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `SearchQuery` / `PaginatedResult` / `IngestionResult` | `types.ts`           | Data transfer shapes that flow between controller → service → repository.                                                             |
| `AppError` hierarchy                                  | `errors/AppError.ts` | Operational vs programmer error distinction with auto-status-codes (`NotFoundError`=404, `ValidationError`=400, `ConflictError`=409). |
| Constants                                             | `constants.ts`       | ABR reference codes, pagination bounds (`DEFAULT_PAGE_SIZE`=20, `MAX_PAGE_SIZE`=100).                                                 |

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
Domain:          IBusinessRepository { searchNative(query), searchOptimized(query), findWithFilters(query), ... }
                        ▲
                        │ implements
                        │
Infrastructure:  PostgresBusinessRepository { searchNative (ILIKE), searchOptimized (tsvector @@), ... }
```

**Benefit:** The Application layer calls `repo.searchNative()` or `repo.searchOptimized()` (via the chosen strategy) without knowing the SQL details. Unit tests mock the interface entirely.

### 3.3 Strategy Pattern

**Problem:** Search might be implemented by different algorithms (standard text search, AI-powered natural language search). Hard-coding `if (mode === 'standard')` logic inside the service violates the Open/Closed Principle.

**Solution:** Each algorithm implements `ISearchStrategy.execute()`. The `SearchStrategyFactory` takes the full `SearchQuery` and selects by `technique` (and `mode` for AI). Adding a new technique means adding a new strategy class and one `case` — existing strategies are never modified.

```
                ISearchStrategy
                  ▲         ▲
                  │         │
  NativeSearchStrategy   OptimizedSearchStrategy   AiSearchStrategy (future)
  (ILIKE baseline)      (tsvector + GIN)
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

**Solution:** `SearchStrategyFactory.create(query)` encapsulates the construction logic: it reads `query.technique` (and `query.mode` for AI) and returns the appropriate strategy. The factory receives the repository via DI and passes it to whichever strategy it constructs.

### 3.6 Facade Pattern

**Problem:** The ETL subsystem involves worker thread spawning, message passing, file system access, and database operations. The HTTP controller shouldn't orchestrate all of that.

**Solution:** `IngestionService.ingest(filePath)` hides the complexity behind a single method call — like a car's ignition button that starts the engine, fuel pump, and electronics simultaneously.

### 3.7 Singleton Pattern

**Problem:** Database connections are expensive resources (TCP handshake, authentication, SSL negotiation). Creating one per query would be catastrophically slow.

**Solution:** `getDbConnection()` in `connection.ts` uses a module-level `instance` variable. The first call creates the Knex pool; subsequent calls return the same instance. In a clustered deployment, each OS process gets its own singleton (processes don't share memory).

---

## 4. Database Performance Deep-Dive

Search is implemented in two ways so you can compare performance: **native** (ILIKE, baseline) and **optimized** (full-text search with a GIN index). On large tables (e.g. 9M rows), native can be ~350 ms per query; optimized typically drops to sub-50 ms for selective terms.

### 4.1 Database Schema (Migrations 001 and 002)

**`businesses` table (001):**

- One row per Australian Business Number (ABN). Core columns: `abn`, `entity_name`, `given_name`, `family_name`, `state`, `postcode`, plus ABR and GST fields.
- **`search_vector`** — a `TSVECTOR` column. It is not filled by the application; migration 003 adds a trigger and a one-time backfill so every row has a pre-computed list of lexemes (see below).
- **B-tree indexes** on `abn_status`, `entity_type_code`, `state`, `postcode` for fast equality filters (`WHERE state = 'NSW'`, etc.).
- **UNIQUE** on `abn` for idempotent ETL upserts.

**`business_names` table (002):**

- 1-to-many alternate names (trading, legal, DGR, etc.) per business. Columns: `business_id` (FK to `businesses.id`), `name_type`, `name_text`.
- **Index** on `business_id` for fast JOINs when loading a business with its names.
- **ON DELETE CASCADE** so deleting a business removes its names.

**Why `search_vector` lives in the table:** Full-text matching uses a stored tsvector so we never run `to_tsvector()` over 9M rows at query time. The trigger keeps it in sync on write; the GIN index (below) makes reads fast.

### 4.2 tsvector and to_tsquery — Full-Text Search (Optimized Path)

**What a tsvector is:** PostgreSQL normalizes text into a sorted list of **lexemes** (dictionary tokens) with positions, e.g.:

```sql
to_tsvector('english', 'Smith''s Plumbing Services') → 'plumb':2 'servic':3 'smith':1
```

- **Stemming:** "Plumbing" and "plumber" both become "plumb", so one search term matches both.
- **Stop words:** Words like "the", "a" are dropped.
- **Weights:** The trigger assigns weight A (entity_name), B (given/family name), C (state/postcode) for future relevance ranking.

**What the application does:** For `technique=optimized`, the repository builds a **tsquery** from the user term (e.g. `plumb:*` for prefix match) and runs:

```sql
WHERE search_vector @@ to_tsquery('english', ?)
```

So matching is done on the stored lexemes, not on raw `ILIKE` over 9M rows. That alone would still be slow without an index — hence the GIN index in migration 003.

### 4.3 GIN Index on search_vector (Migration 003)

**Problem:** Without an index, `search_vector @@ to_tsquery(...)` would require a sequential scan of every row.

**Solution:** A **GIN (Generalized Inverted Index)** on `search_vector` maps each lexeme to the list of row IDs that contain it. The planner can then answer "which rows contain lexeme X?" by index lookup instead of scanning the table.

**What migration 003 does:**

1. **Trigger function** `businesses_search_vector_trigger`: Sets `NEW.search_vector` from `entity_name` (A), `given_name` / `family_name` (B), `state` / `postcode` (C) using `to_tsvector('english', ...)` and `setweight(...)`.
2. **Trigger** `trg_businesses_search_vector`: Fires **BEFORE INSERT OR UPDATE** on `businesses` so every new or changed row gets an up-to-date `search_vector`.
3. **Backfill:** One-time `UPDATE businesses SET search_vector = ...` for rows where `search_vector IS NULL` (e.g. existing 9M rows before the trigger existed). This can take several minutes.
4. **GIN index** `idx_businesses_search_vector` on `businesses(search_vector)` so `@@` queries use the index.

**Current indexes (no pg_trgm yet):**

| Index                          | Type   | Column(s)          | Purpose                                         |
| ------------------------------ | ------ | ------------------ | ----------------------------------------------- |
| `idx_businesses_search_vector` | GIN    | `search_vector`    | Fast full-text match for `technique=optimized`. |
| `idx_businesses_abn_status`    | B-tree | `abn_status`       | Filter by ABN status.                           |
| `idx_businesses_entity_type`   | B-tree | `entity_type_code` | Filter by entity type.                          |
| `idx_businesses_state`         | B-tree | `state`            | Filter by state.                                |
| `idx_businesses_postcode`      | B-tree | `postcode`         | Filter by postcode.                             |

A future optimization layer can add the `pg_trgm` extension and GIN trigram indexes for typo-tolerant search; the current layer is **full-text only**.

### 4.4 Native vs Optimized Search Paths

| Aspect                        | Native (`technique=native`)    | Optimized (`technique=optimized`)                 |
| ----------------------------- | ------------------------------ | ------------------------------------------------- |
| **Repository method**         | `searchNative()`               | `searchOptimized()`                               |
| **Predicate**                 | `entity_name ILIKE '%term%'`   | `search_vector @@ to_tsquery('english', tsQuery)` |
| **Index used**                | None (sequential scan)         | GIN on `search_vector`                            |
| **Typical latency (9M rows)** | ~350 ms                        | Sub-50 ms for selective terms                     |
| **Use case**                  | Baseline comparison, debugging | Production search                                 |

Both paths share the same pagination and filtering: capped total (`config.search.maxCandidates`), filters (state, postcode, etc.), and `findWithFilters()` when there is no search term.

### 4.5 Schema Design Decisions

**Separate `business_names` table:** Keeps row size down and allows future indexing of `name_text` (e.g. trigram) without bloating the main table.

**UNIQUE on `abn`:** Enables idempotent ETL with `ON CONFLICT (abn) MERGE`.

**Column sizing:** `abn` VARCHAR(11), `state` VARCHAR(3), etc., to keep index and cache footprint small.

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

| Approach                                     | Memory                  | Speed                                          | Suitability                              |
| -------------------------------------------- | ----------------------- | ---------------------------------------------- | ---------------------------------------- |
| **DOM Parser** (load entire XML into memory) | ~2-3GB for 580MB file   | Must parse everything before processing begins | Unsuitable — would OOM on most machines. |
| **SAX Parser** (event-driven stream)         | ~64KB buffer (constant) | Processes records as they're parsed            | Ideal for large datasets.                |

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

| Direction     | Message Type | Data                                                          |
| ------------- | ------------ | ------------------------------------------------------------- |
| Main → Worker | `workerData` | `{ filePath, dbConfig, batchSize }`                           |
| Worker → Main | `progress`   | `{ processed: number }` (every 10,000 records)                |
| Worker → Main | `done`       | `{ totalProcessed, totalInserted, totalUpdated, durationMs }` |
| Worker → Main | `error`      | `{ message: string }`                                         |

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

| Order | Middleware       | Purpose                                                             |
| ----- | ---------------- | ------------------------------------------------------------------- |
| 1     | `helmet()`       | Sets security headers (CSP, X-Frame-Options, HSTS, etc.)            |
| 2     | `cors()`         | Allows cross-origin requests from frontend apps                     |
| 3     | `compression()`  | Gzips response bodies (typical 70-90% size reduction for JSON)      |
| 4     | `express.json()` | Parses JSON request bodies into `req.body`                          |
| 5     | `requestLogger`  | Pino-based structured logging of every request/response with timing |
| 6     | Routes           | The actual API endpoints                                            |
| 7     | `errorHandler`   | **Must be last** — catches errors from all routes above             |

### 6.3 Error Handling Strategy

The custom error hierarchy in `AppError.ts` distinguishes:

| Error Type           | Status Code | `isOperational` | Client Response                                         |
| -------------------- | ----------- | --------------- | ------------------------------------------------------- |
| `NotFoundError`      | 404         | `true`          | Error message sent to client                            |
| `ValidationError`    | 400         | `true`          | Error message sent to client                            |
| `ConflictError`      | 409         | `true`          | Error message sent to client                            |
| `AppError` (generic) | any         | `true`          | Error message sent to client                            |
| Unexpected `Error`   | 500         | N/A             | Generic "Internal server error" (never leaks internals) |

### 6.4 API Endpoints

| Method | Path                        | Description                                             |
| ------ | --------------------------- | ------------------------------------------------------- |
| `GET`  | `/api/v1/health`            | Liveness probe (uptime, timestamp)                      |
| `GET`  | `/api/v1/businesses/search` | Full-text + fuzzy search with filters and pagination    |
| `GET`  | `/api/v1/businesses/:abn`   | Single business lookup by ABN (includes business_names) |
| `POST` | `/api/v1/ingest`            | Trigger ETL ingestion of an XML file                    |

**Search query parameters:**

| Parameter    | Type   | Default    | Description                                                        |
| ------------ | ------ | ---------- | ------------------------------------------------------------------ |
| `q`          | string | —          | Search term (ILIKE for native, tsquery for optimized)              |
| `state`      | string | —          | Filter by Australian state code                                    |
| `postcode`   | string | —          | Filter by postcode                                                 |
| `entityType` | string | —          | Filter by entity type code (IND, PRV, etc.)                        |
| `abnStatus`  | string | —          | Filter by ABN status (ACT, CAN)                                    |
| `page`       | number | 1          | Page number (1-indexed)                                            |
| `limit`      | number | 20         | Results per page (max: 100)                                        |
| `technique`  | string | `native`   | Search technique: `native` (ILIKE) or `optimized` (tsvector + GIN) |
| `mode`       | string | `standard` | Search mode: `standard` or `ai` (future)                           |

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

| Concern            | Cluster (HTTP)                          | Worker Threads (ETL)                                 |
| ------------------ | --------------------------------------- | ---------------------------------------------------- |
| **Purpose**        | Parallel HTTP request handling          | CPU-intensive XML parsing                            |
| **Isolation**      | Separate OS processes (separate memory) | Separate V8 isolates (shared process, separate heap) |
| **Communication**  | IPC via `process.send()`                | `postMessage()` / `workerData`                       |
| **DB connections** | Own pool per process                    | Own pool per worker thread                           |
| **When used**      | Always (production server)              | On-demand (seed script or ingest endpoint)           |

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
- **`SearchStrategyFactory`** — Confirms correct strategy for `technique=native` / `technique=optimized`, 501 for `mode=ai`, 400 for unknown technique.
- **`SearchService`** — Verifies delegation to factory-created strategies and `NotFoundError` on missing ABN lookups.

### 8.3 Integration Tests

Integration tests exercise the full HTTP stack (middleware → routes → controllers → services) with a mock repository injected via the DI container:

- **Health endpoint** — Verifies 200 OK, JSON content type, and presence of `uptime`/`timestamp` fields.
- **Business endpoints** — Tests search with pagination, empty results, filter-only queries, ABN lookup success, and 404 on missing ABN.

The DI override technique in integration tests:

```typescript
beforeAll(async () => {
  await import('@core/container'); // Bootstrap DI
  container.register(TOKENS.BusinessRepository, { useValue: mock }); // Override with mock
  const { createApp } = await import('@interfaces/http/app'); // Now build the app
  app = createApp();
});
```

This ensures the mock is in place before any service resolves the repository token.

### 8.4 Coverage & Scripts

| Script                     | Command                               | Purpose                       |
| -------------------------- | ------------------------------------- | ----------------------------- |
| `npm test`                 | `jest`                                | Run all tests                 |
| `npm run test:unit`        | `jest --testPathPatterns=unit`        | Unit tests only               |
| `npm run test:integration` | `jest --testPathPatterns=integration` | Integration tests only        |
| `npm run test:coverage`    | `jest --coverage`                     | Full run with coverage report |

---

## 9. Scalability Roadmap

The current prototype handles a single 580MB XML file (~800,000 records). Here's how to scale to **20 files (12GB+, 16M+ rows)** while maintaining fast search and API responsiveness.

### 9.1 Data Ingestion at Scale

| Bottleneck                 | Current Approach                              | Scaled Approach                                                                                                               |
| -------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Single-file processing** | One worker thread processes one XML file      | **Parallel workers:** Spawn one worker per file (up to CPU core count). Each worker gets its own connection pool.             |
| **Batch size**             | 5,000 rows per flush                          | Tune dynamically based on row width. Profile with `EXPLAIN ANALYZE` to find the sweet spot (typically 2,000–10,000).          |
| **Trigger overhead**       | tsvector trigger fires on every INSERT/UPDATE | **Disable trigger during bulk load**, rebuild tsvector in a single `UPDATE` afterward. This can cut ingestion time by 30-50%. |
| **Index overhead**         | GIN indexes maintained incrementally          | **Drop indexes before load, rebuild after.** Incremental GIN updates are slower than building from scratch.                   |
| **Transaction wrapping**   | Each batch is auto-committed                  | Wrap batches in explicit transactions for fewer WAL (write-ahead log) flushes.                                                |

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

| Technique                          | Impact                                                                                                                                  | Implementation                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Table partitioning**             | Partition `businesses` by `state` (9 partitions). Queries filtering by state only scan the relevant partition.                          | `CREATE TABLE businesses (...) PARTITION BY LIST (state)`                                                                |
| **Materialized views**             | Pre-compute common aggregations (count by state, entity type distribution) to avoid full table scans.                                   | `CREATE MATERIALIZED VIEW biz_state_counts AS SELECT state, COUNT(*) ...` with `REFRESH MATERIALIZED VIEW CONCURRENTLY`. |
| **Connection pooling (PgBouncer)** | With 20 cluster workers × 10 connections each = 200 connections. PgBouncer multiplexes these down to ~30 actual PostgreSQL connections. | Deploy PgBouncer in `transaction` pooling mode between the app and PostgreSQL.                                           |
| **Read replicas**                  | Offload search queries to read replicas; primary handles only writes (ingestion).                                                       | PostgreSQL streaming replication with application-level read/write splitting.                                            |
| **Redis caching**                  | Cache frequently searched terms and their result sets (TTL: 5-30 minutes). Reduces database load for popular queries.                   | `ioredis` + cache-aside pattern in the repository or a caching middleware.                                               |
| **Partial indexes**                | If most queries target active businesses, create partial indexes: `WHERE abn_status = 'ACT'`. Smaller index = faster lookups.           | `CREATE INDEX idx_active_biz_search ON businesses USING GIN (search_vector) WHERE abn_status = 'ACT'`                    |

### 9.3 Application-Level Scaling

| Technique                  | Impact                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rate limiting**          | Prevent abuse with `express-rate-limit` (e.g., 100 req/min per IP).                                                                                                             |
| **Request queuing**        | For ingestion requests, push jobs to a message queue (BullMQ + Redis) instead of spawning workers synchronously. Prevents resource exhaustion under concurrent ingest requests. |
| **Horizontal scaling**     | Deploy multiple application instances behind a load balancer (Nginx, AWS ALB). Each instance runs its own cluster of workers.                                                   |
| **Health check readiness** | Add a `/health/ready` endpoint that pings the database. Load balancers should use this for traffic routing (not just the `/health` liveness check).                             |
| **Response compression**   | Already in place (`compression` middleware). For very large result sets, consider streaming JSON responses (`res.write()` in chunks).                                           |

### 9.4 Database Tuning for Large Datasets

| PostgreSQL Setting     | Default   | Recommended for 16M+ rows             | Why                                                                        |
| ---------------------- | --------- | ------------------------------------- | -------------------------------------------------------------------------- |
| `shared_buffers`       | 128MB     | 25% of RAM (e.g., 4GB on 16GB server) | Larger buffer cache = more data served from memory.                        |
| `effective_cache_size` | 4GB       | 75% of RAM (e.g., 12GB)               | Helps the query planner prefer index scans over sequential scans.          |
| `work_mem`             | 4MB       | 64–256MB                              | Allows in-memory sorting and hashing for complex queries.                  |
| `maintenance_work_mem` | 64MB      | 1–2GB                                 | Speeds up `CREATE INDEX`, `VACUUM`, and bulk ingestion.                    |
| `max_connections`      | 100       | 200–300 (or use PgBouncer)            | Support more cluster workers.                                              |
| `random_page_cost`     | 4.0       | 1.1 (SSD)                             | Tells the planner that random I/O is nearly as fast as sequential on SSDs. |
| `wal_level`            | `replica` | `minimal` (during bulk load only)     | Reduces WAL generation during ingestion. Reset to `replica` after.         |

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

| Variable                | Type   | Default         | Purpose                                                                                    |
| ----------------------- | ------ | --------------- | ------------------------------------------------------------------------------------------ |
| `PORT`                  | number | 3000            | HTTP server port                                                                           |
| `NODE_ENV`              | enum   | development     | Environment mode                                                                           |
| `DB_HOST`               | string | localhost       | PostgreSQL host                                                                            |
| `DB_PORT`               | number | 5432            | PostgreSQL port                                                                            |
| `DB_NAME`               | string | vantage         | Database name                                                                              |
| `DB_USER`               | string | postgres        | Database user                                                                              |
| `DB_PASSWORD`           | string | (empty)         | Database password                                                                          |
| `DB_POOL_MIN`           | number | 2               | Minimum pool connections                                                                   |
| `DB_POOL_MAX`           | number | 10              | Maximum pool connections                                                                   |
| `WEB_CONCURRENCY`       | number | 0 (= CPU count) | Number of cluster workers                                                                  |
| `LOG_LEVEL`             | enum   | info            | Pino log level                                                                             |
| `ETL_BATCH_SIZE`        | number | 5000            | Records per batch flush                                                                    |
| `ETL_DATA_DIR`          | string | ./temp          | Directory containing XML data files                                                        |
| `SEARCH_MAX_CANDIDATES` | number | 5000            | Cap on candidate IDs for search count and pagination; keeps latency stable for broad terms |

### 10.2 Code Quality Tooling

| Tool                                 | Purpose                                                                                    | Config File                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| **TypeScript** (`strict: true`)      | Static type checking with no implicit `any`, strict null checks, unused variable detection | `tsconfig.json`                        |
| **ESLint 10** (flat config)          | Linting with `typescript-eslint` rules                                                     | `eslint.config.mjs`                    |
| **Prettier**                         | Opinionated code formatting                                                                | `.prettierrc`                          |
| **eslint-plugin-simple-import-sort** | Deterministic import ordering                                                              | Configured in `eslint.config.mjs`      |
| **Husky**                            | Git hooks manager                                                                          | `.husky/pre-commit`, `.husky/pre-push` |
| **lint-staged**                      | Pre-commit: run ESLint + Prettier only on staged `.ts` files                               | `package.json` → `lint-staged`         |
| **Jest + ts-jest**                   | Testing framework with TypeScript support                                                  | `jest.config.js`                       |
| **Supertest**                        | HTTP assertion library for integration tests                                               | Used in `*.integration.test.ts`        |

### 10.3 Path Aliases

```json
{
  "@core/*": "src/core/*",
  "@domain/*": "src/domain/*",
  "@infrastructure/*": "src/infrastructure/*",
  "@application/*": "src/application/*",
  "@interfaces/*": "src/interfaces/*",
  "@workers/*": "src/workers/*",
  "@shared/*": "src/shared/*"
}
```

Configured in `tsconfig.json` for TypeScript compilation, `jest.config.js` for test resolution, and resolved at build time by `tsc-alias` (post-compilation path rewriting).
