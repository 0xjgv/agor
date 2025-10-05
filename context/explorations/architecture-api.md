# API Architecture & Multi-Client Strategy

**Category:** Exploration
**Status:** Design Phase (January 2025)

Related: [[architecture]], [[state-management]], [[cli]], [[models]]

---

## Overview

Agor is a **multi-client system** where CLI, GUI, and future web clients all interact with the same data layer. This document defines the API architecture that enables:

1. **Local-first development** - Fast offline operations
2. **Real-time collaboration** - Multi-user session trees (V2)
3. **Dogfooding** - All clients use the same API
4. **Clean architecture** - Service layer abstracts storage

**Key Insight:** Build API layer from day 1, even for local-only V1, to avoid costly retrofit when adding cloud sync.

---

## The Stack

### Full Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Clients                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │   CLI    │  │   GUI    │  │  Desktop │            │
│  │ (oclif)  │  │ (React)  │  │(Electron)│            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       └─────────────┼─────────────┘                    │
└─────────────────────┼──────────────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────────┐
│         Feathers Client (@agor/client)                 │
│  REST + WebSocket + TypeScript SDK                     │
└─────────────────────┬──────────────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────────┐
│         Feathers Server (agor-daemon)                  │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Services (Business Logic)                       │ │
│  │  - SessionService: CRUD + fork/spawn/genealogy  │ │
│  │  - BoardService: CRUD + session management      │ │
│  │  - RepoService: Git worktree operations         │ │
│  │  - TaskService: CRUD + git state tracking       │ │
│  └──────────────────┬───────────────────────────────┘ │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐ │
│  │  Hooks (Middleware)                              │ │
│  │  - Authentication & authorization                │ │
│  │  - Validation (Zod schemas)                      │ │
│  │  - Business rules (genealogy, git state)        │ │
│  └──────────────────┬───────────────────────────────┘ │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐ │
│  │  Drizzle ORM (Data Layer)                        │ │
│  │  - Type-safe queries                             │ │
│  │  - Schema management                             │ │
│  │  - Migrations                                     │ │
│  └──────────────────┬───────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
┌───────▼────────┐         ┌────────▼────────┐
│  LibSQL        │         │  PostgreSQL     │
│  (Local)       │         │  (Cloud)        │
│  ~/.agor/      │         │  Turso/Supabase │
│  sessions.db   │         │                 │
└────────────────┘         └─────────────────┘
```

### Technology Choices

| Layer | Technology | Why |
|-------|-----------|-----|
| **API Framework** | FeathersJS | REST + WebSocket, TypeScript-native, service-based architecture |
| **ORM** | Drizzle | Lightweight, type-safe, SQL-first, LibSQL support |
| **Local DB** | LibSQL/SQLite | File-based, offline-first, embedded replicas |
| **Cloud DB** | PostgreSQL (Turso/Supabase) | Scalable, LibSQL compatible via Turso |
| **UI Framework** | React + Vite | Fast dev, HMR, component-based |
| **CLI Framework** | oclif | TypeScript, plugin system, enterprise-grade |
| **Desktop** | Electron or Tauri | Native app, bundles daemon + UI |
| **Monorepo** | Turborepo + pnpm | Fast builds, shared packages |

---

## Why FeathersJS?

### Comparison with Alternatives

| Framework | REST | Real-time | TypeScript | Local-first | Verdict |
|-----------|------|-----------|------------|-------------|---------|
| **FeathersJS** | ✅ | ✅ WebSocket | ✅ Native | ✅ Offline client | 🏆 **Best fit** |
| NestJS + @nestjsx/crud | ✅ | ⚠️ Manual Socket.IO | ✅ Native | ❌ Cloud-first | Good but heavier |
| LoopBack 4 | ✅ | ❌ | ✅ Native | ❌ | Missing real-time |
| Express (raw) | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual | ❌ | Too much work |
| tRPC | ✅ | ⚠️ Subscriptions | ✅ Native | ⚠️ | Great for TS-only, no multi-client |
| PostgREST | ✅ | ❌ | ❌ | ❌ | PostgreSQL-only |

### FeathersJS Advantages for Agor

**1. Service-Based Architecture**

Define a service once, get REST + WebSocket + typed client:

```typescript
// agor-daemon/src/services/sessions/sessions.class.ts
export class SessionService implements ServiceMethods<Session> {
  constructor(private db: DrizzleClient) {}

  async find(params: Params): Promise<Session[]> {
    return await this.db.select().from(sessions).all();
  }

  async get(id: string): Promise<Session> {
    return await this.db.select().from(sessions).where(eq(sessions.session_id, id)).get();
  }

  async create(data: Partial<Session>): Promise<Session> {
    return await this.db.insert(sessions).values(data).returning().get();
  }

  // Custom methods
  async fork(id: string, prompt: string): Promise<Session> {
    const parent = await this.get(id);
    return await this.create({
      ...parent,
      session_id: generateId(),
      genealogy: { forked_from_session_id: id, ... },
      description: prompt,
    });
  }

  async spawn(id: string, prompt: string): Promise<Session> {
    // Similar to fork but different genealogy
  }
}
```

**Automatically get REST endpoints:**
```
GET    /api/sessions
GET    /api/sessions/:id
POST   /api/sessions
PATCH  /api/sessions/:id
DELETE /api/sessions/:id
POST   /api/sessions/:id/fork    # Custom method
POST   /api/sessions/:id/spawn   # Custom method
```

**2. Real-Time Built-In**

```typescript
// Client automatically gets real-time updates
client.service('sessions').on('created', (session) => {
  console.log('New session created:', session);
});

client.service('sessions').on('patched', (session) => {
  console.log('Session updated:', session);
});
```

**3. Offline-First Client**

Feathers has official offline-first support:
```typescript
import { makeOfflineFirst } from '@feathersjs-offline/client';

const client = feathers();
const sessions = client.service('sessions');

// Wrap service for offline support
makeOfflineFirst(sessions, {
  storage: window.localStorage,
  timedSync: 300000, // Sync every 5 minutes
});

// Works offline, queues mutations, syncs when online
await sessions.create({...}); // Works even offline!
```

**4. Hooks for Business Logic**

Middleware that runs before/after service methods:

```typescript
// agor-daemon/src/services/sessions/sessions.hooks.ts
export default {
  before: {
    all: [authenticate('jwt')],
    create: [
      validateSchema(sessionSchema),
      setDefaults,
      ensureGitState,
    ],
    patch: [
      validateSchema(sessionSchema),
      preventOrphanedSessions,
    ],
  },
  after: {
    create: [
      createInitialTask,
      notifyCollaborators,
    ],
  },
};
```

**5. TypeScript-Native**

Auto-typed client from server schema:

```typescript
// Shared types
type ServiceTypes = {
  sessions: SessionService;
  boards: BoardService;
  tasks: TaskService;
  repos: RepoService;
};

// Client knows all methods and types
const client = feathers<ServiceTypes>();
const sessions = client.service('sessions');

// Fully typed!
const session: Session = await sessions.get('abc123');
const forked: Session = await sessions.fork('abc123', 'Try new approach');
```

---

## Development Architecture

### Local Development Setup

**Two-server approach** (standard for React + API):

```
Terminal 1: Feathers API Server
$ cd agor-daemon
$ npm run dev
# Runs on http://localhost:3030

Terminal 2: Vite Dev Server
$ cd agor-ui
$ npm run dev
# Runs on http://localhost:5173
# Proxies /api → localhost:3030
```

**Or use Turborepo (single command):**
```bash
# From root
$ npm run dev
# Starts both daemon + UI in parallel
```

### Vite Configuration (Proxy to Feathers)

```typescript
// agor-ui/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to Feathers
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
      // Proxy WebSocket connections
      '/socket.io': {
        target: 'ws://localhost:3030',
        ws: true,
      },
    },
  },
});
```

### React Uses Feathers Client

```typescript
// agor-ui/src/lib/feathers.ts
import feathers from '@feathersjs/client';
import socketio from '@feathersjs/socketio-client';
import io from 'socket.io-client';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3030';

const client = feathers();

// REST transport
client.configure(feathers.rest(apiUrl).fetch(window.fetch));

// WebSocket transport (real-time)
const socket = io(apiUrl);
client.configure(socketio(socket));

export default client;
```

**React Hook Example:**
```typescript
// agor-ui/src/hooks/useSessions.ts
import { useState, useEffect } from 'react';
import client from '@/lib/feathers';

export function useSessions(boardId?: string) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionsService = client.service('sessions');

    // Initial fetch
    sessionsService.find({ query: { board_id: boardId } })
      .then((result) => {
        setSessions(result.data);
        setLoading(false);
      });

    // Real-time listeners
    const handleCreated = (session: Session) => {
      setSessions((prev) => [...prev, session]);
    };

    const handlePatched = (session: Session) => {
      setSessions((prev) =>
        prev.map((s) => (s.session_id === session.session_id ? session : s))
      );
    };

    const handleRemoved = (session: Session) => {
      setSessions((prev) =>
        prev.filter((s) => s.session_id !== session.session_id)
      );
    };

    sessionsService.on('created', handleCreated);
    sessionsService.on('patched', handlePatched);
    sessionsService.on('removed', handleRemoved);

    return () => {
      sessionsService.removeListener('created', handleCreated);
      sessionsService.removeListener('patched', handlePatched);
      sessionsService.removeListener('removed', handleRemoved);
    };
  }, [boardId]);

  return { sessions, loading };
}
```

**Component Usage:**
```typescript
// agor-ui/src/components/SessionList.tsx
function SessionList({ boardId }: { boardId: string }) {
  const { sessions, loading } = useSessions(boardId);

  if (loading) return <Spin />;

  return (
    <List
      dataSource={sessions}
      renderItem={(session) => (
        <SessionCard session={session} />
      )}
    />
  );
}
```

---

## CLI Architecture

### CLI as Feathers Client

```typescript
// agor-cli/src/lib/feathers.ts
import feathers from '@feathersjs/client';
import rest from '@feathersjs/rest-client';
import fetch from 'node-fetch';

export function createClient(apiUrl?: string) {
  const url = apiUrl || process.env.AGOR_API_URL || 'http://localhost:3030';
  const client = feathers();

  client.configure(rest(url).fetch(fetch));

  return client;
}
```

**Command Example:**
```typescript
// agor-cli/src/commands/session/start.ts
import { Command, Flags } from '@oclif/core';
import { createClient } from '../../lib/feathers';
import { generateId } from '../../lib/ids';

export default class SessionStart extends Command {
  static flags = {
    agent: Flags.string({ options: ['claude-code', 'cursor', 'codex', 'gemini'] }),
    board: Flags.string(),
    prompt: Flags.string(),
  };

  async run() {
    const { flags } = await this.parse(SessionStart);
    const client = createClient();

    // Create session via Feathers API
    const session = await client.service('sessions').create({
      session_id: generateId(),
      agent: flags.agent || 'claude-code',
      status: 'idle',
      description: flags.prompt,
      // ... other fields
    });

    this.log(`Created session ${session.session_id}`);

    // Launch agent CLI
    await this.launchAgent(session);
  }
}
```

### Auto-Start Daemon

CLI auto-starts Feathers daemon if not running:

```typescript
// agor-cli/src/lib/daemon.ts
import { spawn } from 'child_process';
import fetch from 'node-fetch';

export async function ensureDaemon(): Promise<void> {
  // Check if daemon is running
  try {
    await fetch('http://localhost:3030/health');
    return; // Already running
  } catch {
    // Not running, start it
  }

  // Start daemon in background
  const daemon = spawn('agor-daemon', ['--port', '3030'], {
    detached: true,
    stdio: 'ignore',
  });

  daemon.unref();

  // Wait for daemon to be ready
  for (let i = 0; i < 30; i++) {
    try {
      await fetch('http://localhost:3030/health');
      return; // Daemon is ready
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Failed to start daemon');
}
```

**Usage in commands:**
```typescript
export default class SessionStart extends Command {
  async run() {
    // Ensure daemon is running
    await ensureDaemon();

    // Now safe to make API calls
    const client = createClient();
    // ...
  }
}
```

---

## Production Architectures

### Mode 1: Desktop App (Electron/Tauri)

**Structure:**
```
Agor.app
├── main/                  # Electron main process
│   ├── main.ts           # Auto-starts daemon
│   └── daemon/           # Bundled agor-daemon binary
├── renderer/             # React UI (Vite build)
│   └── dist/             # Static files
└── preload/              # IPC bridge
```

**Flow:**
1. User launches Agor.app
2. Electron main process starts `agor-daemon` on Unix socket
3. Electron loads React UI from `file://` protocol
4. React connects to daemon via `http://localhost:3030` or `unix:///tmp/agor.sock`
5. Real-time updates via WebSocket

**Benefits:**
- ✅ Fully offline (no internet required)
- ✅ Fast local operations
- ✅ Native system integration
- ✅ Auto-updates (Electron)

---

### Mode 2: Cloud Deployment (Optional)

**If deploying web version:**

**Option A: Separate Static + API**
```
┌─────────────────────────────────────┐
│  Vercel/Netlify                     │
│  https://agor.dev                   │
│  Static React build                 │
└──────────────┬──────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────┐
│  Fly.io/Railway                     │
│  https://api.agor.dev               │
│  Feathers server + PostgreSQL       │
└─────────────────────────────────────┘
```

**Option B: Single Server** (simpler)
```
┌─────────────────────────────────────┐
│  Fly.io/Railway                     │
│  https://agor.dev                   │
│                                     │
│  Feathers serves:                   │
│  ├─ /           → React static      │
│  └─ /api        → REST endpoints    │
└─────────────────────────────────────┘
```

**Configuration:**
```typescript
// agor-daemon/src/app.ts
import path from 'path';
import serveStatic from 'feathers-static';

const app = feathers();

// Serve API
app.use('/api/sessions', new SessionService());
app.use('/api/boards', new BoardService());

// Serve static React build (production only)
if (process.env.NODE_ENV === 'production') {
  app.use('/', serveStatic(path.join(__dirname, '../ui/dist')));
}
```

---

## Sync Strategies

### V1: Local Only

```
CLI/GUI → Feathers Daemon → LibSQL
         (localhost:3030)    (~/.agor/sessions.db)
```

- All operations local
- No network required
- Fast (<10ms latency)

---

### V2: Cloud Sync (Git-Style)

**Explicit push/pull:**

```bash
# Work locally
agor session start --prompt "Add auth"
agor session start --prompt "Fix CORS"

# Push to cloud
agor sync push

# Pull from cloud
agor sync pull

# Switch to always-cloud mode
agor config set storage.type cloud
```

**Implementation:**
```typescript
// agor-cli/src/commands/sync/push.ts
export default class SyncPush extends Command {
  async run() {
    const localClient = createClient('http://localhost:3030');
    const cloudClient = createClient('https://api.agor.dev');

    // Get all local sessions modified since last sync
    const sessions = await localClient.service('sessions').find({
      query: { updated_at: { $gt: lastSyncTimestamp } },
    });

    // Push to cloud
    for (const session of sessions) {
      await cloudClient.service('sessions').create(session);
    }

    this.log(`Pushed ${sessions.length} sessions to cloud`);
  }
}
```

---

### V3: Always-Online (Future)

**Real-time collaboration:**

```
User A's CLI ──┐
               ├──→ Cloud Feathers ──→ PostgreSQL
User B's GUI ──┘         │
                         ├──→ WebSocket broadcast
                         │
           ┌─────────────┴─────────────┐
           │                           │
      User A hears                User B hears
      "User B created session"    "User A forked session"
```

**Conflict Resolution:**
- Use Feathers hooks to detect conflicts
- Last-write-wins for most fields
- Merge strategies for arrays (tasks, children)
- Operational Transform for concurrent edits (future)

---

## Monorepo Structure

```
agor/
├── apps/
│   ├── agor-daemon/              # Feathers API server
│   │   ├── src/
│   │   │   ├── app.ts           # Feathers app
│   │   │   ├── services/
│   │   │   │   ├── sessions/
│   │   │   │   │   ├── sessions.class.ts
│   │   │   │   │   ├── sessions.hooks.ts
│   │   │   │   │   └── sessions.schema.ts
│   │   │   │   ├── boards/
│   │   │   │   ├── tasks/
│   │   │   │   └── repos/
│   │   │   ├── db/
│   │   │   │   ├── drizzle.ts   # Drizzle client
│   │   │   │   └── schema.ts    # Drizzle schemas
│   │   │   └── hooks/           # Global hooks
│   │   └── package.json
│   │
│   ├── agor-cli/                 # CLI (oclif)
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   └── lib/
│   │   │       ├── feathers.ts  # Client factory
│   │   │       └── daemon.ts    # Auto-start daemon
│   │   └── package.json
│   │
│   ├── agor-ui/                  # React + Vite
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   └── feathers.ts  # Client factory
│   │   │   ├── hooks/
│   │   │   │   └── useSessions.ts
│   │   │   └── components/
│   │   ├── vite.config.ts       # Proxy config
│   │   └── package.json
│   │
│   └── agor-desktop/             # Electron (future)
│       ├── main/
│       ├── renderer/
│       └── package.json
│
├── packages/
│   ├── client/                   # Shared Feathers client
│   │   ├── src/
│   │   │   └── client.ts
│   │   └── package.json
│   │
│   ├── types/                    # Shared TypeScript types
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── db/                       # Shared Drizzle schemas
│       ├── src/
│       │   └── schema.ts
│       └── package.json
│
├── package.json                  # Turborepo root
├── turbo.json                    # Turborepo config
└── pnpm-workspace.yaml          # pnpm workspaces
```

---

## Implementation Roadmap

### Phase 1: Feathers + Local (Q1 2025)

**Week 1-2: Feathers Server Setup**
- [ ] Initialize `agor-daemon` with Feathers
- [ ] Integrate Drizzle ORM
- [ ] Implement SessionService (CRUD + fork/spawn)
- [ ] Implement BoardService
- [ ] Implement TaskService
- [ ] Add authentication hooks
- [ ] Add validation hooks (Zod)

**Week 3: CLI Integration**
- [ ] Create Feathers client library
- [ ] Update CLI commands to use Feathers API
- [ ] Implement daemon auto-start
- [ ] Test offline scenarios

**Week 4: UI Integration**
- [ ] Add Feathers client to React
- [ ] Create React hooks (useSessions, useBoards, useTasks)
- [ ] Wire up components to API
- [ ] Test real-time updates

### Phase 2: Real-Time + Sync (Q2-Q3 2025)

**Week 1-2: WebSocket Integration**
- [ ] Enable WebSocket transport in daemon
- [ ] Add real-time listeners in UI
- [ ] Test multi-client scenarios

**Week 3-4: Cloud Deployment**
- [ ] Deploy Feathers to Fly.io/Railway
- [ ] Migrate to PostgreSQL for cloud
- [ ] Implement sync commands (push/pull)
- [ ] Add conflict resolution

### Phase 3: Desktop App (Q4 2025)

**Week 1-2: Electron Setup**
- [ ] Create Electron wrapper
- [ ] Bundle daemon with app
- [ ] Auto-start daemon on app launch

**Week 3-4: Polish**
- [ ] Native menus and shortcuts
- [ ] Auto-updates
- [ ] Installer/DMG

---

## Key Design Decisions

### 1. Why Feathers over Express/NestJS?

**Feathers:**
- ✅ REST + WebSocket from one codebase
- ✅ Service-based architecture (maps to Agor domains)
- ✅ Offline-first client support
- ✅ Lightweight (~20kb core)

**NestJS:**
- ⚠️ Enterprise-scale (overkill for local daemon)
- ⚠️ No built-in WebSocket (need Socket.IO separately)
- ✅ Better for large teams, microservices

### 2. Why Local Daemon Pattern?

**Benefits:**
- CLI/GUI don't need database drivers
- Consistent API interface (local = cloud)
- Business logic in one place (daemon)
- Easier to add auth/validation later

**Precedents:**
- Docker Desktop (Docker daemon)
- Git LFS (LFS server)
- VSCode (extension host)

### 3. Why Drizzle + Feathers (not Feathers ORM)?

Feathers supports multiple ORMs. Drizzle gives:
- ✅ Better TypeScript inference
- ✅ LibSQL support (via Turso)
- ✅ Lightweight (7kb vs 100kb+ for Sequelize)
- ✅ SQL-first approach (easier complex queries)

---

## References

**Feathers:**
- Docs: https://feathersjs.com/
- Offline-first: https://feathersjs-offline.github.io/

**Drizzle:**
- Docs: https://orm.drizzle.team/
- LibSQL adapter: https://orm.drizzle.team/docs/drizzle-with-turso

**Related Agor Docs:**
- `context/concepts/architecture.md` - High-level architecture
- `context/explorations/state-management.md` - Drizzle + LibSQL strategy
- `context/explorations/cli.md` - CLI design
- `context/concepts/models.md` - Data models
