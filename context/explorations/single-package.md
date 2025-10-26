# Single-Package Distribution

**Status:** Simplified - Single Package Distribution
**Target:** Phase 4 (Q2 2025)
**Date:** January 2025
**Update:** Package name `agor` is taken on npm - using `agor-live`

---

## Problem Statement

Currently, Agor requires:

- Git clone of the monorepo
- pnpm installation
- Manual daemon + UI startup in separate terminals
- Development-mode commands (`pnpm agor ...`)

**This is fine for contributors but poor UX for end users.**

---

## Goal

Provide single npm package for easy installation:

```bash
npm install -g agor-live
agor daemon start      # Start daemon manually
agor session list      # CLI commands (daemon must be running)
agor ui open           # Opens browser → http://localhost:3030
```

**Single package, explicit daemon control, no magic.**

---

## Recommended Approach: Single Package with Manual Daemon

**Architecture:**

```
agor-live (npm package)
├── bin/
│   ├── agor.js           # CLI entry point
│   └── agor-daemon.js    # Daemon entry point
└── dist/
    ├── core/             # Bundled @agor/core code
    ├── cli/              # Bundled CLI code
    ├── daemon/           # Bundled daemon code
    └── ui/               # Pre-built React app (served at /ui)
```

**User Experience:**

```bash
npm install -g agor-live
agor daemon start         # Start daemon manually in background
agor session list         # CLI commands (requires daemon running)
agor ui open              # Opens browser → http://localhost:3030/ui
```

**Key Features:**

- ✅ Single package installation (everything bundled)
- ✅ Explicit daemon control (no auto-start magic)
- ✅ UI bundled and served from daemon at localhost:3030/ui
- ✅ Clear error messages if daemon not running
- ✅ Works offline (local SQLite database)
- ✅ No external dependencies to publish

---

## Implementation Details

### Package Structure

```
agor/ (monorepo - development)
├── apps/
│   ├── agor-cli/            # CLI source
│   ├── agor-daemon/         # Daemon source
│   └── agor-ui/             # UI source
│
└── packages/
    ├── core/                # Shared code (bundled, not published)
    └── agor-live/           # Published package
        ├── package.json
        ├── bin/
        │   ├── agor.js
        │   └── agor-daemon.js
        └── dist/            # Built artifacts (copied here)
            ├── core/
            ├── cli/
            ├── daemon/
            └── ui/
```

### Daemon Lifecycle Management

```bash
agor daemon start      # Start daemon in background
agor daemon stop       # Stop daemon gracefully
agor daemon status     # Check daemon health
agor daemon logs       # View daemon logs (~/.agor/logs/daemon.log)
agor daemon restart    # Restart daemon
```

**Manual Start Required:**

- CLI commands check if daemon is running
- If not running, exit with error: "Daemon not running. Start with: agor daemon start"
- No auto-start behavior (explicit control)
- Daemon runs until manually stopped

**Implementation:**

```typescript
// apps/agor-cli/src/utils/health.ts
export async function checkHealth(url: string, timeout = 2000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      // Prevent hanging on connection refused
      keepalive: false
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    // Connection refused, timeout, or network error
    return false;
  }
}

export async function ensureDaemonRunning(): Promise<void> {
  const isRunning = await checkHealth('http://localhost:3030/health', 1000); // 1s timeout
  if (!isRunning) {
    console.error('Error: Daemon not running.');
    console.error('Start the daemon with: agor daemon start');
    process.exit(1);
  }
}

// Before every CLI command (in base command class)
async init() {
  await ensureDaemonRunning();
}
```

**Key improvements:**

- 1-second timeout on health check (fast feedback)
- AbortController to cancel hanging requests
- Fail immediately on connection refused

### Build & Bundle Process

**Build script for `agor-live` package:**

```bash
# 1. Build core
cd packages/core
pnpm build

# 2. Build UI
cd ../../apps/agor-ui
pnpm build

# 3. Build CLI
cd ../agor-cli
pnpm build

# 4. Build Daemon
cd ../agor-daemon
pnpm build

# 5. Bundle everything into agor-live package
cd ../../packages/agor-live
mkdir -p dist/{core,cli,daemon,ui}
cp -r ../core/dist/* dist/core/
cp -r ../../apps/agor-cli/dist/* dist/cli/
cp -r ../../apps/agor-daemon/dist/* dist/daemon/
cp -r ../../apps/agor-ui/dist/* dist/ui/
```

**`packages/agor-live/package.json`:**

```json
{
  "name": "agor-live",
  "version": "1.0.0",
  "description": "Multiplayer canvas for orchestrating AI coding sessions",
  "bin": {
    "agor": "./bin/agor.js",
    "agor-daemon": "./bin/agor-daemon.js"
  },
  "files": ["bin/", "dist/"],
  "dependencies": {
    "drizzle-orm": "^0.x.x",
    "feathers": "^5.x.x"
    // ... other runtime deps
  }
}
```

---

## UI Distribution Strategy

### Option A: UI Served by Daemon (Current)

**How it works:**

- Daemon serves compiled React app at `http://localhost:3030/ui`
- `agor ui open` opens browser to daemon URL
- UI bundled into daemon package

**Pros:**

- Single backend to manage
- UI always matches daemon version
- No CORS issues

**Cons:**

- Daemon package size increases (~2-5MB for UI bundle)
- Daemon must serve static files (performance overhead)

---

### Option B: Separate UI Package

**How it works:**

- UI published as separate `@agor/ui` npm package
- User runs `npx @agor/ui` to start UI dev server
- UI connects to daemon via WebSocket

**Pros:**

- Smaller daemon package
- UI can be updated independently
- Cleaner separation of concerns

**Cons:**

- Requires two processes (daemon + UI)
- CORS configuration needed
- Version mismatch potential

---

### Recommended: Option A (UI Served by Daemon)

**Reasoning:**

- Simple single-package distribution
- No CORS issues or version mismatches
- UI always matches daemon version
- Teams can self-host Agor daemon
- Additional ~2-5MB is acceptable for better UX

---

## Package Naming Strategy

**Decision: `agor-live` (unscoped)**

The package name `agor` is already taken on npm, so we use `agor-live`:

```bash
npm install -g agor-live
```

**Binary names:**

- `agor` - Main CLI binary
- `agor-daemon` - Daemon binary (optional direct use)

**Why `agor-live`:**

- Simple, unscoped package name
- Single installation command
- Clear branding (live collaboration)
- Avoids complexity of scoped packages

---

## Daemon Lifecycle Management

**Decision: Manual Start/Stop Only**

**User workflow:**

```bash
agor daemon start              # Start in background
agor daemon stop               # Stop daemon
agor daemon status             # Check status
agor daemon logs               # View logs
agor session list              # Fails if daemon not running
```

**Implementation:**

- Use pid files (`~/.agor/daemon.pid`)
- Spawn detached child process
- Log to `~/.agor/logs/daemon.log`
- Health check before every CLI command (1s timeout)
- Fast-fail with clear error message

**Pros:**

- Explicit control (no magic)
- Simple implementation (no auto-start logic)
- Easy to debug (user knows daemon state)

**Cons:**

- User must remember to start daemon
- Extra step on first use

---

## Build & Release Workflow

### Monorepo Structure (Current)

```
agor/
├── apps/
│   ├── agor-cli/       # CLI package
│   ├── agor-daemon/    # Daemon package
│   └── agor-ui/        # UI package
└── packages/
    └── core/           # Shared @agor/core
```

### NPM Publishing Strategy

**Single package publish:**

```bash
# 1. Build everything
cd packages/agor-live
./build.sh  # Builds core, CLI, daemon, UI and copies to dist/

# 2. Publish agor-live (contains everything)
pnpm publish
```

**That's it!** One package, one publish command.

### Release Automation (Changesets)

Use [Changesets](https://github.com/changesets/changesets) for version management:

```bash
pnpm changeset         # Create changeset
pnpm changeset version # Bump versions
pnpm changeset publish # Publish to npm
```

**CI/CD (GitHub Actions):**

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm build
      - run: pnpm changeset publish
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Installation Size Comparison

| Distribution    | Size  | Includes          | Installation Time |
| --------------- | ----- | ----------------- | ----------------- |
| Git clone (dev) | ~50MB | Full source       | ~30s (pnpm)       |
| agor-live (npm) | ~12MB | CLI + daemon + UI | ~15s              |

**Recommendation:** Target <20MB for bundled package

---

## Comparison with Similar Tools

### pm2 (Process Manager)

```bash
npm install -g pm2
pm2 start app.js
pm2 list
pm2 logs
```

**What we can learn:**

- Simple daemon management commands
- Automatic restart on failure
- Log aggregation (`pm2 logs`)
- Status dashboard (`pm2 monit`)

---

### Vercel CLI

```bash
npm install -g vercel
vercel login                   # First-time setup
vercel deploy                  # Auto-detects project
```

**What we can learn:**

- First-run experience (`vercel login` guides user)
- Auto-detection of project type
- Global config in `~/.vercel`
- Minimal commands, smart defaults

---

### Prisma CLI

```bash
npm install -g prisma
prisma init                    # Setup wizard
prisma migrate dev             # Auto-starts Prisma Studio
```

**What we can learn:**

- `init` command is guided wizard (interactive prompts)
- Commands can spawn GUI (Prisma Studio)
- Clear separation: CLI for operations, Studio for visualization

---

## Decision Summary

**Chosen approach:** Single all-in-one package with manual daemon control

| Aspect                 | Decision                           |
| ---------------------- | ---------------------------------- |
| Package naming         | `agor-live` (everything bundled)   |
| Package count          | 1 (no separate core/cli/daemon)    |
| Installation           | `npm install -g agor-live`         |
| Time to implement      | 2 weeks                            |
| User setup complexity  | Medium (manual daemon start)       |
| Total package size     | ~12MB                              |
| Cross-platform support | ✅ (Node.js)                       |
| Auto-update mechanism  | `npm update -g agor-live`          |
| Daemon lifecycle       | Manual (explicit control)          |
| UI integration         | Bundled, served from daemon at /ui |
| Health check timeout   | 1 second (fast feedback)           |
| Publishing complexity  | Low (1 package, 1 publish)         |

---

## Recommended Roadmap

### Phase 4: npm Release (Q2 2025)

**Goal:** Get Agor on npm as single all-in-one package

**Deliverables:**

- [ ] Add health check with 1s timeout to CLI
- [ ] Add daemon start/stop/status commands to CLI
- [ ] Create `packages/agor-live/` directory
- [ ] Write `build.sh` script that:
  - Builds core, CLI, daemon, UI
  - Copies all artifacts to `agor-live/dist/`
- [ ] Create `bin/agor.js` and `bin/agor-daemon.js` entry points
- [ ] Configure `agor-live/package.json` with bins, files, dependencies
- [ ] Test local installation: `npm install -g ./packages/agor-live`
- [ ] Publish `agor-live` to npm
- [ ] Update README with npm install instructions
- [ ] Add quickstart guide (install → daemon start → CLI usage)

**Timeline:** 1-2 weeks

---

## Open Questions

1. **Daemon port:** Hardcode 3030 or make configurable?
   - **Recommendation:** Hardcode 3030, add `--port` override flag

2. **Bundle strategy:** Copy built artifacts or use esbuild/webpack?
   - **Recommendation:** Copy built artifacts (simpler, preserves sourcemaps)

3. **Binary entry points:** How should bins reference bundled code?
   - **Recommendation:** `bin/agor.js` → `require('../dist/cli/index.js')`

4. **Node_modules:** Bundle dependencies or list in package.json?
   - **Recommendation:** List in package.json (let npm handle installation)

5. **Multi-user:** How to handle multiple users on same machine?
   - **Recommendation:** Per-user database (`~/.agor/`), daemon runs per-user

---

## References

- [oclif plugins](https://oclif.io/docs/plugins)
- [Changesets](https://github.com/changesets/changesets)
- [pm2](https://pm2.keymetrics.io/)
- [Vercel CLI](https://vercel.com/docs/cli)
- [Prisma CLI](https://www.prisma.io/docs/reference/api-reference/command-reference)
