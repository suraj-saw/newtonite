# Newtonite Operations — Work Coordination System

Internal web application for coordinating operational work across teams: customer issues, engineering problems, payment investigations, incidents, compliance requests, and operational tasks.

Built as a **modular monolith** with FastAPI, PostgreSQL 16, and React 19 (Vite). Designed for high correctness, explainability, robust resource-level authorization, and reliable concurrent use.

---

## 📋 System Prerequisites & Docker Setup Guide

All application components are containerized. You do **not** need Python, PostgreSQL, or Node.js installed on your host computer. You only need **Git** and **Docker with Docker Compose v2**.

### 🪟 Windows Setup (Setting up WSL 2 & Docker Desktop)

If you are running Windows 10 or 11, follow these steps to ensure Docker uses the high-performance **WSL 2 (Windows Subsystem for Linux)** backend:

#### Step 1: Install / Enable WSL 2
1. Open **PowerShell as Administrator** (right-click Start menu ➔ select *Terminal (Admin)* or *Windows PowerShell (Admin)*).
2. Run the automated WSL install command:
   ```powershell
   wsl --install
   ```
   *(If WSL is already installed, update it to the latest version by running `wsl --update`)*.
3. Set the default WSL version to 2:
   ```powershell
   wsl --set-default-version 2
   ```
4. **Restart your computer** if prompted by Windows.

#### Step 2: Install Docker Desktop
1. Download and run the installer from the official Docker website: [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).
2. During the installation wizard, ensure the option **"Use WSL 2 instead of Hyper-V (recommended)"** is **checked**.
3. Complete the installation and restart your computer if required.

#### Step 3: Enable WSL 2 Backend in Docker Desktop Settings
1. Open **Docker Desktop**.
2. Click the **Settings (Gear icon)** in the top navigation bar.
3. Under the **General** tab:
   - Ensure **"Use the WSL 2 based engine"** is checked.
4. Under the **Resources ➔ WSL integration** tab:
   - Check **"Enable integration with my default WSL distro"**.
   - If you installed Ubuntu or another distro, toggle the switch to **On** for that distribution.
5. Click **Apply & restart** at the bottom right.

---

### 🍏 macOS Setup
1. Download [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) (select the **Apple Silicon** chip or **Intel** chip version matching your Mac).
2. Open the downloaded `.dmg` file and drag **Docker** into your **Applications** folder.
3. Open Docker from Applications, approve the security prompts, and wait for the status indicator in the menu bar to show green (*Docker Desktop is running*).

---

### 🐧 Linux Setup (Ubuntu / Debian)
1. Update apt packages and install Docker Engine with the Docker Compose plugin:
   ```bash
   sudo apt-get update
   sudo apt-get install -y ca-certificates curl gnupg
   sudo install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   sudo chmod a+r /etc/apt/keyrings/docker.gpg

   echo \
     "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
     $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
     sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

   sudo apt-get update
   sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```
2. Enable and start the Docker daemon:
   ```bash
   sudo systemctl enable --now docker
   ```
3. Add your current user to the `docker` group so you can run commands without `sudo`:
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

---

### 🔍 Verification: Check Docker on Any OS

Open your terminal or PowerShell and run:

```bash
docker --version
docker compose version
```

Confirm that Docker is actively running by running the official test container:
```bash
docker run --rm hello-world
```
If you see `"Hello from Docker!"`, your system is 100% ready to run Newtonite.

---

## 🚀 Complete Step-by-Step Setup Instructions

### Step 1: Clone the repository and enter the directory

```bash
git clone <repository-url>
cd newtonite
```

### Step 2: Verify or create the environment configuration (`.env`)

The repository already includes a pre-configured, ready-to-run [`.env`](.env) file. 

If you ever need to restore default environment settings, copy from `.env.example`:

* **Linux / macOS**:
  ```bash
  cp .env.example .env
  ```
* **Windows (PowerShell)**:
  ```powershell
  Copy-Item .env.example .env
  ```
* **Windows (Command Prompt)**:
  ```cmd
  copy .env.example .env
  ```

### Step 3: Build and start all services with Docker Compose

Run the build and startup command:

```bash
docker compose up --build
```

*(Tip: If you want to run the containers in detached background mode so your terminal remains free, add the `-d` flag: `docker compose up --build -d`)*.

#### What happens automatically during this step:
1. **`postgres` container**: Boots PostgreSQL 16 on port `5432` with a persistent Docker volume (`postgres_data`) and runs health checks.
2. **`backend` container**: Waits for PostgreSQL to become healthy, automatically applies all database migrations (`alembic upgrade head`), and idempotently seeds initial demo teams, users, tasks, and audit logs (`python -m app.seed`).
3. **`frontend` container**: Compiles the React 19 SPA, builds production assets, and serves them via Nginx with automated reverse-proxying for `/api` requests on port `8080`.

### Step 4: Verify the deployment status

Open a new terminal window in the project folder and check the running containers:

```bash
docker compose ps
```

You should see all three services with an `Up` status:
```
NAME                 IMAGE               COMMAND                  SERVICE    STATUS
newtonite-postgres   postgres:16-alpine  "docker-entrypoint.s…"   postgres   Up (healthy)
newtonite-backend    newtonite-backend   "sh -c 'alembic upgr…"   backend    Up
newtonite-frontend   newtonite-frontend  "/docker-entrypoint.…"   frontend   Up
```

To view live application logs across all containers:
```bash
docker compose logs -f
```
Or view logs for a specific service:
```bash
docker compose logs -f backend
```

### Step 5: Access the application in your browser

Once the containers are running, access the services:

| Service | Access URL | Description |
| :--- | :--- | :--- |
| **Web Application** | [http://localhost:8080](http://localhost:8080) | Interactive React operator dashboard |
| **Swagger API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive OpenAPI / Swagger UI (test endpoints directly) |
| **ReDoc API Specs** | [http://localhost:8000/redoc](http://localhost:8000/redoc) | Alternative formatted API reference |
| **Backend Health Check** | [http://localhost:8000/api/health](http://localhost:8000/api/health) | Backend health status (`{"status": "healthy"}`) |

### Step 6: Stopping and restarting the system

* **To stop running containers gracefully**:
  ```bash
  docker compose down
  ```
* **To restart stopped containers without rebuilding**:
  ```bash
  docker compose up -d
  ```
* **To wipe the database and re-seed from scratch** (removes the Docker persistent volume):
  ```bash
  docker compose down -v
  docker compose up --build
  ```

---

## 🔑 Pre-Seeded Demo Credentials

All seed accounts are pre-approved and ready for immediate login at [http://localhost:8080](http://localhost:8080):

| Role | Email | Password | Responsibilities & Test Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@newtonite.local` | `Admin123!` | System administrator. Can approve pending registrations, manage/delete employees, view all teams, and hard-delete work items. |
| **Team Lead** | `lead@newtonite.local` | `Lead123!` | Lead for **Engineering** and **Operations**. Can assign work, change priorities, move teams, and approve pending transitions. |
| **Member (Engineering)** | `member@newtonite.local` | `Member123!` | Member of **Engineering**. Can edit and transition assigned tasks, add comments. |
| **Member (Payments)** | `member2@newtonite.local` | `Member123!` | Member of **Payments**. Cross-team isolation prevents viewing Engineering items. |
| **Outsider** | `outsider@newtonite.local` | `Member123!` | Member of **Payments**. Used to test permission boundary violations (403 Forbidden). |

---

## 👤 Creating New Accounts & Administrative Approval Workflow

Newtonite includes a built-in security feature: **all newly registered operator accounts require administrative approval before they can access the system.**

### Step-by-Step Approval Walkthrough

1. **Register a New Account**:
   - Open [http://localhost:8080/login](http://localhost:8080/login) in your browser.
   - Click on the **Sign Up** tab.
   - Enter your Full Name, Email (e.g. `alex@newtonite.local`), Password (minimum 8 characters), and select your desired team (e.g. *Engineering*).
   - Click **Create Account**.
   - Your account is now created in the database, but placed in a **pending approval** status.

2. **Log In as Admin**:
   - Sign in using the administrator credentials:
     - **Email**: `admin@newtonite.local`
     - **Password**: `Admin123!`

3. **Approve the New User**:
   - In the sidebar navigation under the **Administration** heading, click **User Verification** (or navigate directly to [http://localhost:8080/admin/users](http://localhost:8080/admin/users)).
   - You will see the pending employee listed with their name, email, registration date, and requested team.
   - Click the green **Approve** button.
   - The user is now officially authorized, and an automated system notification is generated.

4. **Log In with the New Account**:
   - Click **Logout** to exit the admin account.
   - Sign in with your newly registered credentials (`alex@newtonite.local`).
   - You now have full access to your assigned team's work items, real-time dashboard, and collaboration tools!

---

## 🧪 Running Automated Tests

Newtonite includes automated test suites covering concurrency collision recovery (OCC), duplicate mutation prevention (Idempotency), workflow state machines, and cross-team authorization scoping.

### Backend Tests (29 automated tests)

Run directly inside the running Docker backend container with **zero local Python setup**:

```bash
docker compose exec backend pytest
```

*(Note: The test suite runs against an isolated in-memory SQLite database, executing all 29 unit and integration tests cleanly).*

### Frontend Tests (15 automated tests)

To run the frontend test suite:

```bash
cd frontend
npm test
```

*(Tests UI components, auth store synchronization, notification polling, and state machine transitions using Vitest and React Testing Library).*

---

## ⚙️ Environment Variables Reference

All runtime variables are loaded from the root [`.env`](.env) file:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `POSTGRES_USER` | `newtonite` | PostgreSQL database username |
| `POSTGRES_PASSWORD` | `newtonite` | PostgreSQL database password |
| `POSTGRES_DB` | `newtonite` | PostgreSQL database name |
| `POSTGRES_PORT` | `5432` | Exposed host port for PostgreSQL |
| `DATABASE_URL` | `postgresql+psycopg://newtonite:newtonite@postgres:5432/newtonite` | Connection string for SQLAlchemy |
| `JWT_SECRET` | `change-me-to-a-long-random-string` | Secret key for JWT HMAC signing |
| `JWT_EXPIRE_MINUTES` | `480` | Access token lifespan (8 hours) |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:8080` | Allowed browser origins |
| `BACKEND_PORT` | `8000` | Exposed host port for FastAPI backend |
| `FRONTEND_PORT` | `8080` | Exposed host port for Nginx web frontend |
| `VITE_API_BASE_URL` | `/api` | Proxy base URL for client API requests |

---

## 🔧 Common Troubleshooting & FAQs

### Q1: Port 8080 or 5432 is already allocated by another service on my PC
* **Symptom**: `Bind for 0.0.0.0:8080 failed: port is already allocated` or `5432 failed`.
* **Fix**: If you already have a local PostgreSQL or web server running on those ports, edit your [`.env`](.env) file:
  ```env
  FRONTEND_PORT=8081
  POSTGRES_PORT=5433
  ```
  Then re-run: `docker compose up --build`. The web application will now be accessible at `http://localhost:8081`.

### Q2: "Docker daemon is not running" error
* **Symptom**: `Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?`
* **Fix**: Launch **Docker Desktop** from your computer's applications menu. Wait until the whale icon in the taskbar or menu bar turns solid green (indicating the engine is running), then re-run your command.

### Q3: WSL 2 integration error on Windows
* **Symptom**: `Docker Desktop - WSL 2 distro integration issue` or Docker fails to connect to WSL.
* **Fix**:
  1. Open PowerShell as Administrator and run:
     ```powershell
     wsl --update
     wsl --shutdown
     ```
  2. Open Docker Desktop ➔ **Settings** ➔ **Resources** ➔ **WSL integration** ➔ toggle your distribution on.
  3. Click **Apply & restart**.

### Q4: How do I wipe the database and start fresh with default seed data?
* **Fix**: Run:
  ```bash
  docker compose down -v
  docker compose up --build
  ```
  The `-v` flag removes the Docker named volume (`postgres_data`). When Docker boots back up, it automatically re-runs all Alembic migrations and the database seed script.

---

## 🏛️ Architecture Overview

```
React 19 (Vite)  ──REST / JSON / JWT──►  FastAPI Monolith  ──SQLAlchemy 2.0──►  PostgreSQL 16
```

- **Modular Monolith**: Clean layer separation (`routes` ➔ `services` ➔ `repositories` ➔ `models`).
- **Optimistic Concurrency Control (OCC)**: `version` gating on work items prevents lost updates; returns `409 STALE_VERSION` on concurrent conflicts.
- **Idempotent Mutations**: `POST /api/work-items` accepts `Idempotency-Key` header with SHA-256 payload hashing to prevent duplicate submissions.
- **Server-Side Authorization**: Fine-grained team-level visibility and role-based action gating (`AuthContext`).
- **Co-Transactional Audit Trail**: Status changes, reassignments, priority changes, and comments write to `activity_logs` in the same transaction.

For comprehensive technical specifications, sequence diagrams, and database schemas, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 📡 API Reference Summary

Interactive Swagger UI documentation is available at `http://localhost:8000/docs`.

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate user & return JWT token + cookie | No |
| `POST` | `/api/auth/signup` | Register new employee account (defaults to pending) | No |
| `GET` | `/api/auth/teams` | Public list of teams for signup dropdown | No |
| `POST` | `/api/auth/logout` | Invalidate session version and clear cookie | Yes |
| `GET` | `/api/auth/me` | Fetch profile & team memberships of current user | Yes |
| `PUT` | `/api/auth/me` | Update personal profile details | Yes |
| `GET` | `/api/work-items` | Search, filter, and paginate work items | Yes |
| `POST` | `/api/work-items` | Create new work item (supports `Idempotency-Key`) | Yes |
| `GET` | `/api/work-items/{id}` | Retrieve work item details (scoped to user's teams) | Yes |
| `PATCH` | `/api/work-items/{id}` | Update item fields (requires `version` for OCC) | Yes |
| `DELETE` | `/api/work-items/{id}` | Hard delete work item | Admin only |
| `POST` | `/api/work-items/{id}/assign` | Assign item to user (requires `version`) | Team Lead / Admin |
| `POST` | `/api/work-items/{id}/transition` | Execute workflow status transition | Yes |
| `GET` | `/api/work-items/{id}/activity` | Fetch immutable audit log of changes | Yes |
| `GET/POST`| `/api/work-items/{id}/comments` | List or post discussion comments | Yes |
| `GET` | `/api/notifications` | List user's notifications (assignments, approvals) | Yes |
| `GET` | `/api/notifications/unread-count` | Get count of unread notifications | Yes |
| `PATCH` | `/api/notifications/{id}/read` | Mark single notification as read | Yes |
| `POST` | `/api/notifications/read-all` | Mark all user notifications as read | Yes |
| `DELETE` | `/api/notifications/{id}` | Dismiss notification | Yes |
| `GET` | `/api/teams` | List organizational teams | Yes |
| `POST` | `/api/teams` | Create new team | Admin only |
| `GET` | `/api/teams/{id}` | View team details and member list | Yes |
| `GET` | `/api/users` | List all employee accounts | Admin only |
| `GET` | `/api/users/pending` | List pending employee approval requests | Admin only |
| `POST` | `/api/users/{id}/approve` | Approve registered employee account | Admin only |
| `POST` | `/api/users/{id}/reject` | Reject registered employee account | Admin only |
| `DELETE` | `/api/users/{id}` | Remove employee account | Admin only |
| `GET` | `/api/dashboard/summary` | Aggregated metrics, distributions, and alerts | Yes |
| `GET` | `/api/health` | Service health status check | No |

---

## ⚠️ Known Limitations

These design decisions represent intentional scope boundaries to keep the system maintainable, robust, and focused on core operational correctness:

- **Polling vs WebSockets**: Notifications and dashboard metrics refresh via TanStack Query periodic polling (15s interval and on window focus) rather than stateful WebSockets or Redis pub/sub.
- **Stateless Tokens**: Logout increments the user's `session_version` in the database to invalidate old tokens across devices, without requiring external caching layers like Redis.
- **Search Engine**: Search on title and description uses SQL `ILIKE` rather than dedicated external search engines (e.g., Elasticsearch).
- **Hard Delete for Work Items**: Work items are deleted permanently by administrators rather than soft-deleted. Audit logs cascade with the item upon deletion.
- **Reporting Scope**: Server provides real-time aggregation summaries for operational awareness; complex scheduled batch export pipelines were excluded.

Detailed rationale for all technical decisions can be found in [`ENGINEERING_DECISIONS.md`](ENGINEERING_DECISIONS.md).
