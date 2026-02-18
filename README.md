# Vantage — High-Performance B2B Company Search Directory

A production-grade backend that ingests the **Australian Business Register** (11.5 GB XML, 20M+ businesses) and exposes a lightning-fast search API combining full-text search, fuzzy matching, and filtered queries — all powered by PostgreSQL's native search extensions.

Built with **Node.js 24**, **Express 5**, **TypeScript 5.9**, and **PostgreSQL 17**.

---

## Highlights

| Capability                             | Implementation                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **580 MB XML ingested in ~90 seconds** | SAX streaming parser in a dedicated Worker Thread — zero main-thread blocking                       |
| **Sub-50 ms search across 500K+ rows** | PostgreSQL `tsvector` full-text search + `pg_trgm` trigram fuzzy matching via GIN indexes           |
| **Typo-tolerant search**               | `similarity()` catches "Plumbng" when you meant "Plumbing"                                          |
| **Linguistic search**                  | `ts_rank()` matches "plumber" to "plumbing" via English stemming                                    |
| **Multi-process HTTP**                 | Node.js `cluster` module forks one worker per CPU core for near-linear throughput scaling           |
| **Clean Architecture**                 | Strict layer separation (Domain, Application, Infrastructure, Interfaces) with Dependency Injection |
| **AI-ready**                           | Abstraction layer for plugging in a Text-to-SQL engine (OpenAI, SQLCoder, etc.)                     |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Entry Points                             │
│   server.ts (Cluster Primary)     seed.ts (CLI Ingestion)       │
├─────────────────────────────────────────────────────────────────┤
│                     Interfaces Layer                            │
│   Routes → Controllers → Middleware (Auth, Validation, Errors)  │
├─────────────────────────────────────────────────────────────────┤
│                    Application Layer                            │
│   SearchService ← SearchStrategyFactory → StandardSearchStrategy│
│   IngestionService (Facade) → Worker Thread                     │
├─────────────────────────────────────────────────────────────────┤
│                      Domain Layer                               │
│   Business Entity │ IBusinessRepository │ ISearchStrategy       │
│   IDataSourceAdapter │ ITextToSqlEngine                         │
├─────────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                          │
│   PostgresBusinessRepository │ DB Connection Pool (Singleton)   │
│   Knex Migrations │ pg_trgm + tsvector + GIN Indexes            │
├─────────────────────────────────────────────────────────────────┤
│                     Workers Layer                               │
│   ETL Worker Thread → SAX Parser → XmlAdapter → BatchProcessor  │
└─────────────────────────────────────────────────────────────────┘
```

### Design Patterns Used

| Pattern                  | Where                                                | Why                                                                                                    |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Repository**           | `IBusinessRepository` / `PostgresBusinessRepository` | Decouple domain logic from database engine — swap Postgres for Elasticsearch without touching services |
| **Strategy**             | `ISearchStrategy` / `StandardSearchStrategy`         | Swap search algorithms at runtime (standard vs AI) based on request `mode`                             |
| **Factory**              | `SearchStrategyFactory`                              | Centralise strategy creation — adding a new search mode is one `case` statement                        |
| **Adapter**              | `XmlDataSourceAdapter`                               | Normalize raw ABR XML into domain entities — add a JSON adapter without changing the ETL pipeline      |
| **Facade**               | `IngestionService`                                   | Hide the complexity of worker threads, SAX parsing, and batch processing behind `ingest(filePath)`     |
| **Singleton**            | `getDbConnection()`                                  | One connection pool per process — in a clustered setup, each worker gets its own pool                  |
| **Dependency Injection** | `tsyringe` + Symbol tokens                           | Wire everything in one place (`container.ts`) — swap implementations by changing one line              |

---

## Tech Stack

| Category      | Technology                    | Version                            |
| ------------- | ----------------------------- | ---------------------------------- |
| Runtime       | Node.js                       | 24.x LTS                           |
| Framework     | Express                       | 5.2.1                              |
| Language      | TypeScript                    | 5.9.3 (strict mode)                |
| Database      | PostgreSQL                    | 17 (via Docker)                    |
| Query Builder | Knex.js                       | 3.x                                |
| Validation    | Zod                           | 4.x                                |
| Logging       | Pino                          | 10.x (JSON in prod, pretty in dev) |
| XML Parsing   | SAX                           | 1.4.x (streaming, constant memory) |
| DI Container  | tsyringe                      | 4.x                                |
| Linting       | ESLint 10 + typescript-eslint | Flat config                        |
| Formatting    | Prettier                      | 3.x                                |

---

## Database Performance

Vantage achieves sub-50ms search latency on 500K+ rows through three PostgreSQL features working in concert:

### 1. Full-Text Search (`tsvector` + `to_tsquery`)

Each business row has a pre-computed `search_vector` column containing parsed, stemmed lexemes. A database trigger automatically maintains this column on every INSERT/UPDATE. The `@@` operator performs the match, and `ts_rank()` scores relevance with configurable field weights (entity name = highest, state/postcode = lowest).

### 2. Trigram Fuzzy Matching (`pg_trgm`)

The `pg_trgm` extension decomposes strings into 3-character substrings. `similarity("Plumbing", "Plumbng")` returns ~0.7, enabling typo-tolerant search without an external service like Elasticsearch.

### 3. GIN Indexes (Generalized Inverted Index)

GIN indexes act like a book's back-of-book index — mapping each lexeme/trigram to the rows that contain it. Three GIN indexes cover:

- `entity_name` (trigram ops) — fuzzy name search
- `search_vector` — full-text search
- `business_names.name_text` (trigram ops) — fuzzy trading name search

The search query blends both scores: **60% text rank + 40% trigram similarity**, giving the best of linguistic understanding and typo tolerance.

---

## Project Structure

```
src/
├── core/                          # App bootstrap — config, logger, DI container, tokens
│   ├── config.ts                  # Zod-validated environment config (single source of truth)
│   ├── logger.ts                  # Pino structured logger
│   ├── types.ts                   # DI injection tokens (Symbols)
│   └── container.ts               # tsyringe DI wiring
│
├── domain/                        # Pure business logic — no external dependencies
│   ├── entities/
│   │   ├── Business.ts            # Core entity (camelCase) + DB row (snake_case)
│   │   └── BusinessName.ts        # 1-to-many trading/business names
│   └── interfaces/
│       ├── IBusinessRepository.ts # Data access contract
│       ├── ISearchStrategy.ts     # Search algorithm contract
│       ├── IDataSourceAdapter.ts  # Data normalisation contract
│       └── ITextToSqlEngine.ts    # AI search abstraction (future)
│
├── shared/                        # Cross-cutting types, errors, constants
│   ├── types.ts                   # SearchQuery, PaginatedResult, IngestionResult
│   ├── errors/AppError.ts         # Operational vs programmer error hierarchy
│   └── constants.ts               # ABR reference codes, pagination defaults
│
├── infrastructure/                # External service implementations
│   ├── database/
│   │   ├── connection.ts          # Singleton connection pool
│   │   └── migrations/            # Versioned schema changes (001, 002, 003)
│   └── repositories/
│       └── PostgresBusinessRepository.ts  # Full-text + fuzzy search implementation
│
├── application/                   # Use cases and orchestration
│   ├── strategies/
│   │   └── StandardSearchStrategy.ts
│   ├── factories/
│   │   └── SearchStrategyFactory.ts
│   └── services/
│       ├── SearchService.ts       # Search orchestrator
│       └── IngestionService.ts    # ETL facade (spawns worker threads)
│
├── workers/                       # Background processing (separate V8 isolates)
│   └── etl/
│       ├── etlWorker.ts           # SAX streaming XML parser
│       ├── XmlDataSourceAdapter.ts # ABR XML → Business entity transformer
│       └── batchProcessor.ts      # Chunked bulk upsert engine
│
├── interfaces/                    # HTTP layer
│   └── http/
│       ├── app.ts                 # Express app factory
│       ├── middleware/            # Error handler, validation, request logger
│       ├── controllers/          # Thin request/response handlers
│       └── routes/               # URL → controller mapping
│
├── scripts/
│   └── seed.ts                    # CLI data ingestion with progress reporting
│
└── server.ts                      # Clustered entry point (1 worker per CPU core)
```

---

## Getting Started

### Prerequisites

- Node.js >= 24.x
- Docker & Docker Compose (for PostgreSQL)

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database credentials

# 3. Start PostgreSQL
docker compose up -d

# 4. Run migrations
npm run migrate

# 5. Seed the database (580MB XML file in ./temp/)
npm run seed -- --file ./temp/20260211_Public20.xml

# 6. Start the server
npm run dev
```

### Available Scripts

| Command                    | Description                                  |
| -------------------------- | -------------------------------------------- |
| `npm run dev`              | Start dev server with hot reload (tsx watch) |
| `npm run build`            | Compile TypeScript + resolve path aliases    |
| `npm start`                | Run production build (clustered)             |
| `npm run migrate`          | Run pending database migrations              |
| `npm run migrate:rollback` | Rollback the last migration batch            |
| `npm run seed`             | Ingest XML data via CLI with progress output |
| `npm run seed:migrate`     | Run migrations then seed in one command      |
| `npm run lint`             | Run ESLint on src/                           |
| `npm run format`           | Format all TypeScript files with Prettier    |

---

## API Endpoints

### Search Businesses

```
GET /api/v1/businesses/search?q=plumbing&state=NSW&page=1&limit=20
```

Query Parameters:
| Param | Type | Description |
|---|---|---|
| `q` | string | Search term (full-text + fuzzy) |
| `state` | string | Filter by Australian state (NSW, VIC, QLD...) |
| `postcode` | string | Filter by postcode |
| `entityType` | string | Filter by entity type code (IND, PRV, PUB...) |
| `abnStatus` | string | Filter by ABN status (ACT, CAN) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 20, max: 100) |
| `mode` | string | Search mode: `standard` or `ai` (future) |

### Lookup by ABN

```
GET /api/v1/businesses/12345678901
```

### Trigger Ingestion

```
POST /api/v1/ingest
Content-Type: application/json

{ "filePath": "./temp/20260211_Public20.xml" }
```

### Health Check

```
GET /api/v1/health
```

---

## ETL Pipeline

The ingestion pipeline processes 580 MB XML files (~500K records) in approximately 90 seconds:

```
XML File (580 MB)
    │
    ▼
FileReadStream (64 KB chunks)
    │
    ▼
SAX Parser (event-driven, constant memory)
    │  opentag → closetag → text events
    ▼
XmlDataSourceAdapter (Adapter Pattern)
    │  Raw XML → Business domain entity
    ▼
BatchProcessor (5000 records/batch)
    │  Chunked INSERT ON CONFLICT MERGE
    │  (respects PG's 65,535 parameter limit)
    ▼
PostgreSQL (with auto-triggered search_vector update)
```

Key design decisions:

- **Worker Thread isolation**: XML parsing runs in a separate V8 isolate so the HTTP server stays responsive during ingestion.
- **SAX streaming**: Constant ~50 MB memory usage regardless of file size (vs ~3 GB for DOM parsing).
- **Batch upserts**: `INSERT ON CONFLICT MERGE` makes re-runs idempotent — same file can be ingested twice without duplicates.
- **Parameter chunking**: Batches are split into sub-batches of ~4,681 rows to stay under PostgreSQL's 65,535 bind parameter limit.

---

## Scalability Path

The architecture is designed to scale to 20+ ingested XML files (12+ GB total, 16M+ rows):

| Concern                 | Current                          | Scale Strategy                                              |
| ----------------------- | -------------------------------- | ----------------------------------------------------------- |
| **Search latency**      | GIN indexes + composite scoring  | Add `pg_partman` range partitioning by state or entity_type |
| **Connection pressure** | 10 connections/worker            | PgBouncer connection pooler in front of PostgreSQL          |
| **Read throughput**     | Cluster module (N workers)       | Read replicas + load balancer                               |
| **Write throughput**    | Chunked upserts                  | `COPY` protocol for initial loads, upserts for incremental  |
| **AI search**           | Interface stub                   | Plug in SQLCoder or OpenAI wrapper via `ITextToSqlEngine`   |
| **Caching**             | None (fast enough for prototype) | Redis with cache-aside pattern on hot search queries        |
| **Monitoring**          | Pino JSON logs                   | Prometheus metrics + Grafana dashboards                     |

---

## License

ISC
