# Engineering Decisions & Architecture Trade-Offs

This document presents the formal Architectural Decision Records (ADRs) for the **Newtonite** operational work coordination system. It documents the technical context, design rationale, trade-offs, and consequences of each foundational decision governing the system's architecture, data consistency, security, and concurrency models.

---

## 1. Architectural Style: Modular Monolith vs Distributed Microservices

### Context & Problem Statement
Operational work coordination requires atomic interactions across work items, team memberships, activity histories, and notification dispatches. The system must be straightforward to self-host, audit, and evaluate in single-node environments while maintaining strong transactional guarantees.

### Decision
Adopt a **modular monolith** architecture comprising:
1. A **FastAPI** backend organized into distinct, decoupled domain modules (`routes`, `services`, `repositories`, `models`, `schemas`).
2. A single **PostgreSQL 16** relational database as the unified source of truth.
3. A decoupled **React SPA** (Vite + TypeScript) interfacing via a versioned REST/JSON API.

### Rationale & Alternatives Considered
- *Microservices (Rejected):* Introducing separate services for work items, notifications, and auth would introduce distributed transactions (2PC/Sagas), eventual consistency edge cases, network serialization latency, and deployment complexity.
- *Modular Monolith (Chosen):* Allows all cross-entity operations (e.g. updating an item, appending an immutable audit entry, and generating notifications) to occur within an atomic database transaction. Internal modularity ensures components remain decoupled and could be extracted into standalone services if organizational boundaries require it in the future.

### Trade-offs & Consequences
- **Positive:** Guaranteed ACID transactions; zero distributed transaction failures; single containerized deployment pipeline; low cognitive overhead.
- **Negative:** Independent horizontal scaling of distinct modules is not possible without scaling the whole application container.

---

## 2. Authentication & Session Lifecycle: Database Session Versioning vs Distributed Cache

### Context & Problem Statement
The application requires authenticated access via JWTs with two critical security and governance requirements:
1. If a user logs out in one browser tab, all other tabs in the same browser must immediately terminate the session.
2. If a user logs into a new browser/device or explicitly logs out, previous sessions must be immediately invalidated server-side.
3. Third-party session stores like Redis were restricted by self-hosted simplicity requirements.

### Decision
Implement **Stateless JWTs with Database-Backed Session Versioning (`session_version`)** complemented by **Browser-Level Storage Synchronization**:
- **Cross-Tab Synchronization:** The frontend listens to the native browser `storage` event (`window.addEventListener("storage", ...)`). Clearing the local session marker in one tab instantly notifies all sibling tabs to clear in-memory state and redirect to `/login`.
- **Server-Side Revocation Without Redis:** An integer column `session_version` is stored on the `users` table and embedded into the JWT claims (`sub` + `session_version`). When a user logs in on a new device or logs out (`POST /api/auth/logout`), `user.session_version` increments by 1.
- **Validation Pipeline:** The authentication dependency (`get_current_user`) verifies that `token.session_version == user.session_version`. If a mismatch is detected, the request is rejected with `401 Unauthorized` ("Session expired because you logged in from another device").
- **Transport Security:** Session tokens are delivered via `HttpOnly`, `SameSite=lax` cookies to mitigate Cross-Site Scripting (XSS), with fallback Bearer header support for headless API clients.

### Rationale & Alternatives Considered
- *External Token Blacklist in Redis (Rejected):* Requires running, securing, and maintaining a separate stateful caching layer.
- *Database-Backed Session Versioning (Chosen):* The user entity is already queried per authenticated request to resolve permissions and team memberships; verifying an integer column adds zero additional queries and guarantees immediate session revocation across all devices.

### Trade-offs & Consequences
- **Positive:** Zero external infrastructure dependencies; instantaneous server-side revocation on logout or credential compromise; transparent cross-tab logout.
- **Negative:** Completely stateless JWT verification is sacrificed in favor of a single database lookup per request.

---

## 3. Concurrency Control: Version-Gated Optimistic Concurrency vs Pessimistic Row Locking

### Context & Problem Statement
Multiple operators across different teams concurrently inspect, assign, update, and resolve work items. If two users submit simultaneous updates based on the same prior state, a naive `UPDATE` statement causes a silent lost update (the second write overwrites the first without user awareness).

### Decision
Implement **Optimistic Concurrency Control (OCC) via Explicit Version Gating**:
- Every `work_item` row maintains an integer `version` field, starting at `1`.
- All mutating endpoints (`PATCH /api/work-items/{id}`, `POST /api/work-items/{id}/assign`, `POST /api/work-items/{id}/transition`) require the client to provide the `version` on which the update was predicated.
- The service compares the stored `version` against `supplied_version`:
  - **Match:** The update is applied, `version` is incremented by 1, an audit log is appended, and the transaction commits.
  - **Mismatch:** The transaction rolls back, and the API returns `409 Conflict` with error code `STALE_VERSION`.
- The frontend TanStack Query layer intercepts `409` responses, alerts the operator via a conflict toast, and invalidates query caches to automatically reload the newest server state.

### Rationale & Alternatives Considered
- *Pessimistic Locking (`SELECT FOR UPDATE` across HTTP sessions) (Rejected):* Holding locks across HTTP round-trips creates deadlock hazards, vulnerability to abandoned requests, and poor throughput under operator think-time.
- *CRDTs / Operational Transforms (Rejected):* Unwarranted complexity for structured operational records with discrete business workflow rules.
- *Optimistic Concurrency Control (Chosen):* Non-blocking, completely stateless across HTTP requests, and reliably guarantees that no operator can overwrite data they have not seen.

### Trade-offs & Consequences
- **Positive:** High read/write throughput; zero lock contention; clear client reconciliation pathway.
- **Negative:** Under extreme concurrent write contention on a single item, losing writers must re-read and resubmit their changes.

---

## 4. Idempotent Mutation Strategy: Database Unique Constraints vs Distributed Lock Managers

### Context & Problem Statement
Unstable network connections or operator double-clicks can cause duplicate `POST /api/work-items` submissions, resulting in duplicate tickets, redundant investigation effort, and skewed operational metrics.

### Decision
Implement **Database-Enforced Idempotency Keys**:
- The client provides an optional `Idempotency-Key` header with `POST /api/work-items`.
- The backend stores the cryptographic hash of the request body alongside `(user_id, idempotency_key)` in an `idempotency_keys` table protected by a `UNIQUE(user_id, key)` constraint.
- When an idempotency key is received:
  - If a record exists with the **same hash**: The endpoint replays the original `201 Created` response payload without re-executing business logic.
  - If a record exists with a **different hash**: The endpoint rejects the request with `409 Conflict` (`IDEMPOTENCY_KEY_REUSED`).
  - If no record exists: The work item and the idempotency record are inserted within the **same atomic database transaction**.

### Rationale & Alternatives Considered
- *Distributed Lock Managers / Redis TTL Keys (Rejected):* Adds multi-system synchronization points and risks orphan locks on application crashes.
- *Relational Unique Constraints (Chosen):* Leverages PostgreSQL's native ACID transaction guarantees to guarantee that duplicate requests cannot race or produce orphaned entities.

### Trade-offs & Consequences
- **Positive:** Complete protection against network retries and double submissions; zero external infrastructure.
- **Negative:** Idempotency storage grows proportionally with creations unless a periodic retention/cleanup policy is applied.

---

## 5. Authorization & Governance: Resource-Level Service Enforcement vs Superficial UI Hiding

### Context & Problem Statement
In multi-team operations (e.g. Engineering, Operations, Payments), sensitive investigations must remain isolated. Non-members should not be able to read or mutate work items of another team simply by discovering an item's ID. Furthermore, governance rules dictate that only Team Leads and Admins may reassign work, change priorities, or approve resolutions.

### Decision
Implement **Strict Resource-Level Authorization at the Service Boundary**:
- UI hiding of actions is treated solely as ergonomics, never as security.
- Every incoming request resolves an `AuthContext` containing `user_id`, `is_admin`, `team_ids` (member of), and `lead_team_ids` (lead of).
- Every service method enforces a deterministic 3-tier Role Matrix:
  - **Global Administrator (`is_admin=True`):** Can access all teams, verify/reject user registrations, manage the employee directory, hard-delete work items, and create teams.
  - **Team Lead (`MembershipRole.TEAM_LEAD`):** Scoped to led teams. Authorized to reassign items, adjust priority levels, transfer items between teams, and execute restricted workflow transitions (e.g. approving items in `PENDING_APPROVAL`).
  - **Team Member (`MembershipRole.MEMBER`):** Scoped to member teams. Authorized to view team work items, update status/fields on assigned items, and contribute comments.
- **Cross-Team Isolation:** Requests targeting work items outside the user's assigned teams are rejected with `403 Forbidden`.

### Rationale & Alternatives Considered
- *Role-Based Access Control via Static Route Decorators (Rejected):* Static route decorators only check global roles (e.g. `is_admin`) and fail to enforce resource-level multi-tenancy (e.g. "is user a lead of *this specific item's team*?").
- *Service-Layer Context Inspection (Chosen):* Enforces business security rules consistently whether invoked from REST endpoints, background tasks, or tests.

### Trade-offs & Consequences
- **Positive:** Impossible to bypass team boundaries via ID guessing; explicit auditability in automated tests.
- **Negative:** Requires team membership resolution on authenticated requests.

---

## 6. Notification Delivery: Periodic Client Polling vs Persistent WebSockets

### Context & Problem Statement
Operators require timely awareness when work is assigned to them, status changes occur, approvals are requested, or comments are added.

### Decision
Implement **Co-Transactional In-App Notifications with Periodic TanStack Query HTTP Polling**:
- Notifications are generated synchronously inside the `NotificationService` within the **same database transaction** as the triggering mutation (assignment, transition, approval, comment, registration).
- The client application polls `GET /api/notifications/unread-count` and `/api/notifications` at a regular 15-second interval and upon window focus.

### Rationale & Alternatives Considered
- *WebSockets / Server-Sent Events (SSE) (Rejected):* WebSockets introduce stateful connection management, reconnect logic, load balancer affinity constraints, heartbeat overhead, and the requirement for a Redis pub/sub backplane to broadcast events across multiple worker processes.
- *HTTP Polling (Chosen):* Operational task coordination operates at human latency (seconds, not milliseconds). Polling is stateless, completely cache-friendly, works seamlessly through all firewalls/reverse proxies, and adds zero stateful infrastructure.

### Trade-offs & Consequences
- **Positive:** Extremely robust; zero connection leak risks; trivial deployment behind standard Nginx reverse proxies.
- **Negative:** Notification latency is bounded by the 15-second poll window; periodic HTTP requests generate baseline database read load.

---

## 7. Data Consistency & Audit Trails: Co-Transactional Logging vs Asynchronous Event Sinks

### Context & Problem Statement
Operational compliance requires an immutable history of every meaningful state change (status transition, assignment change, priority adjustment, team transfer, due date modification). Important actions must not silently disappear.

### Decision
Implement an **Immutable, Append-Only `activity_logs` Table Written Co-Transactionally**:
- `activity_logs` records `work_item_id`, `actor_id`, `action`, `field_name`, `old_value`, `new_value`, and `created_at`.
- The audit record is flushed and committed inside the **exact same database transaction** as the entity mutation.
- The REST API provides `GET /api/work-items/{id}/activity` for audit review, but provides **no `PUT`, `PATCH`, or `DELETE` endpoints** for activity logs.
- Hard deletion of a work item by a system administrator cascades its activity history (an intentional design trade-off).

### Rationale & Alternatives Considered
- *Asynchronous Logging via Message Brokers (Kafka/RabbitMQ) (Rejected):* If the message broker is temporarily unreachable or the worker process fails, audit records can be lost or decoupled from the committed database state.
- *Co-Transactional Database Table (Chosen):* If the work item update fails, the audit row rolls back; if the audit insert fails, the work item update rolls back. Guarantees 100% audit consistency.

### Trade-offs & Consequences
- **Positive:** Mathematically guaranteed audit consistency; zero audit loss; tamper-proof via API design.
- **Negative:** Slightly higher transaction write payload size.

---

## 8. Containerization & Deployment: Lean Docker Multi-Stage Build & Zero-Config Runtime

### Context & Problem Statement
The evaluation environment requires running the application across any developer machine with a single command, without external cloud dependencies, manual configuration steps, or local host toolchain mismatches.

### Decision
Structure **Docker Compose with Automated Startup Hooks and Pre-Configured Environments**:
- **Zero-Manual-Config Environment:** Default local development parameters are tracked in a versioned `.env` file, complemented by `.env.example`.
- **Automated Lifecycle Sequencing:** The backend container depends on PostgreSQL's healthcheck (`pg_isready`). Upon database readiness, the container entrypoint sequentially executes:
  1. `alembic upgrade head` (database schema migrations)
  2. `python -m app.seed` (idempotent bootstrap of demo users, teams, and sample work items)
  3. `uvicorn app.main:app` (HTTP application server)
- **Multi-Stage Frontend Build:** Compiles TypeScript in Node 20 and packages production bundles into an unprivileged Nginx alpine image with automated reverse-proxy routing for `/api`.

### Rationale & Alternatives Considered
- *Manual Database Setup & Migration Commands (Rejected):* High cognitive load on reviewers and prone to setup sequence errors.
- *Automated Docker Lifecycle (Chosen):* Execution requires solely `docker compose up --build`.

### Trade-offs & Consequences
- **Positive:** 100% reproducible execution across macOS, Linux, and Windows; zero pre-existing host dependencies except Docker.
- **Negative:** Initial image build requires a few minutes to fetch base images and build dependencies.

---

## 9. Automated Testing Strategy for Critical Behaviors

Automated testing is explicitly targeted at dangerous behaviors, edge cases, and compliance boundaries rather than redundant CRUD validation.

### 9.1 Backend Test Architecture (29 Tests via Pytest)
Tests run against an isolated SQLite test database with zero external dependencies (`docker compose exec backend pytest`):

1. **Optimistic Concurrency Verification ([`test_concurrency.py`](backend/tests/test_concurrency.py)):**
   - Simulates two clients retrieving version 1. Client A updates successfully to version 2; Client B submits version 1 and is rejected with `409 STALE_VERSION`.
   - Simulates concurrent assignment attempts; verifies the second assignment fails with 409 and does not overwrite the first.
2. **Idempotency Verification ([`test_idempotency.py`](backend/tests/test_idempotency.py)):**
   - Verifies duplicate requests with identical `Idempotency-Key` replay the exact stored work item without creating extra records.
   - Verifies key reuse with altered payload triggers `409 IDEMPOTENCY_KEY_REUSED`.
   - Verifies idempotency keys are strictly scoped per user.
3. **Workflow State Machine Verification ([`test_workflow.py`](backend/tests/test_workflow.py)):**
   - Asserts illegal transitions (e.g. `OPEN ➔ CLOSED`) return `400 Bad Request`.
   - Tests complete legitimate state lifecycle progression (`OPEN ➔ IN_PROGRESS ➔ PENDING_APPROVAL ➔ RESOLVED ➔ CLOSED`).
   - Asserts transitions to `BLOCKED` require a non-empty `blocked_reason`.
   - Asserts resolution of review-flagged tasks requires Team Lead privileges.
4. **Resource-Level Authorization Verification ([`test_authorization.py`](backend/tests/test_authorization.py)):**
   - Asserts cross-team work item access returns `403 Forbidden`.
   - Asserts non-leads cannot reassign items or modify priorities.
   - Asserts unauthenticated requests to `/api/teams` return `401 Unauthorized`.
   - Asserts `/api/auth/teams` allows unauthenticated access for registration dropdowns.
   - Asserts `/api/users` is restricted to verified administrators (`ctx.is_admin`).
5. **Session & Identity Governance ([`test_auth.py`](backend/tests/test_auth.py)):**
   - Validates bcrypt credential verification.
   - Validates unapproved accounts (`status="PENDING"`) cannot authenticate.
   - Validates single-session invalidation via `session_version` incrementation.
6. **Notification Engine Verification ([`test_notifications.py`](backend/tests/test_notifications.py)):**
   - Asserts automated notification creation on task assignment, comment, and approval.
   - Asserts mark-read, mark-all-read, and dismissal deletion behaviors.
7. **Search & Aggregation Integrity ([`test_search.py`](backend/tests/test_search.py)):**
   - Tests server-side pagination offsets and limits.
   - Verifies dashboard SQL calculation accuracy across status, priority, and team distributions.

### 9.2 Frontend Test Architecture (15 Tests via Vitest)
Tests component rendering, state isolation, and UI error recovery (`cd frontend && npm test`):
- Metric calculation and chart rendering (`tests/dashboard.test.tsx`).
- Work item filtering, pagination, and 409 conflict banner display (`tests/work-items.test.tsx`).
- In-app notification bell dropdown and mark-as-read toggles (`tests/notifications.test.tsx`).
- Login form validation and password visibility toggle (`tests/login.test.tsx`).
- Utility functions for priority badge styling and date parsing (`tests/utils.test.ts`).

---

## 10. Known Architectural Limitations & Boundaries

The following design trade-offs represent intentional scope boundaries to keep the system maintainable, robust, and free from unnecessary infrastructure:

1. **Sub-Second Live Push:** The UI relies on periodic HTTP polling (15s interval and on window focus) rather than full-duplex WebSockets. Changes made by other operators reflect upon the next poll or when triggering a mutation.
2. **Text Search Capability:** Search queries on work item titles and descriptions execute via PostgreSQL `ILIKE`. While performant for tens of thousands of records, enterprise-scale installations would benefit from PostgreSQL Full Text Search (`tsvector`) or dedicated external search clusters (Elasticsearch).
3. **Work Item Deletion Strategy:** Work item deletion is restricted exclusively to system administrators and executes as a hard delete cascading activity logs. An enterprise compliance platform would typically introduce soft-deletion (`deleted_at`) with archival retention.
4. **Notification Scope:** Notifications are strictly in-app to avoid external SMTP/SMS credentials and connectivity requirements during evaluation.
5. **Horizontal Worker Scaling:** Work item mutations, audit logging, and notification creation are processed synchronously within the database transaction rather than offloaded to background message workers (Celery/RabbitMQ).
