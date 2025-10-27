# Single-Package Distribution Implementation

**Status**: ✅ Ready for Testing
**Date**: 2025-01-26

This document describes the implementation of Agor's single-package npm distribution strategy.

---

## Overview

The `agor-live` package bundles the entire Agor application (daemon, CLI, UI, and core) into a single npm package for easy installation and use.

```bash
npm install -g agor-live
agor init
agor daemon start
agor session list
```

---

## Architecture

### Package Structure

```
agor-live/ (npm package)
├── bin/
│   ├── agor.js           # CLI entry point
│   └── agor-daemon.js    # Daemon entry point
├── dist/                 # Bundled artifacts
│   ├── core/            # @agor/core compiled code
│   ├── cli/             # CLI compiled code
│   ├── daemon/          # Daemon compiled code
│   └── ui/              # Pre-built React app
├── package.json
└── README.md
```

### Components

1. **CLI** (`bin/agor.js`)
   - Entry point for all user commands
   - Uses oclif for command routing
   - Commands bundled in `dist/cli/commands/`

2. **Daemon** (`bin/agor-daemon.js`)
   - FeathersJS backend
   - Serves UI at `/ui` in production
   - WebSocket + REST API

3. **Core** (`dist/core/`)
   - Shared types, database, git utilities
   - Used by both CLI and daemon

4. **UI** (`dist/ui/`)
   - Pre-built React application
   - Served as static files by daemon

---

## Key Features Implemented

### 1. Context Detection

**File**: `apps/agor-cli/src/lib/context.ts`

Detects whether CLI is running in development or production mode:

```typescript
export function isInstalledPackage(): boolean {
  return __dirname.includes('node_modules/agor-live');
}
```

**Behavior by Context**:

| Feature                   | Development               | Production                 |
| ------------------------- | ------------------------- | -------------------------- |
| Daemon lifecycle commands | ❌ Error (use `pnpm dev`) | ✅ Available               |
| UI URL                    | `http://localhost:5173`   | `http://localhost:3030/ui` |
| Daemon path               | N/A                       | `dist/daemon/index.js`     |

### 2. Daemon Lifecycle Management

**Files**:

- `apps/agor-cli/src/lib/daemon-manager.ts` - Core utilities
- `apps/agor-cli/src/commands/daemon/*.ts` - CLI commands

**Commands**:

```bash
agor daemon start    # Start in background
agor daemon stop     # Stop gracefully
agor daemon restart  # Restart
agor daemon status   # Check health
agor daemon logs     # View logs (default 50 lines)
```

**Implementation**:

- PID file: `~/.agor/daemon.pid`
- Log file: `~/.agor/logs/daemon.log`
- Process management: Detached child process with `spawn()`
- Graceful shutdown: SIGTERM with 5s timeout, then SIGKILL

### 3. Static UI Serving

**File**: `apps/agor-daemon/src/index.ts` (lines 161-188)

In production mode (`NODE_ENV=production`), daemon serves UI:

```typescript
if (isProduction) {
  const uiPath = path.resolve(dirname, '../../ui');
  app.use('/ui', express.static(uiPath));
  app.use('/ui/*', (_req, res) => {
    res.sendFile(path.join(uiPath, 'index.html'));
  });
}
```

**URL**: `http://localhost:3030/ui`

### 4. Health Check

**Already Implemented** in `@agor/core/api/index.ts`:

```typescript
export async function isDaemonRunning(url: string): Promise<boolean> {
  const response = await fetch(`${url}/health`, {
    signal: AbortSignal.timeout(1000),
  });
  return response.ok;
}
```

- 1-second timeout for fast feedback
- Used by all CLI commands via `BaseCommand.connectToDaemon()`

---

## Build Process

### Build Script

**File**: `packages/agor-live/build.sh`

```bash
#!/bin/bash
# 1. Build core
cd packages/core && pnpm build

# 2. Build CLI
cd apps/agor-cli && pnpm build

# 3. Build daemon
cd apps/agor-daemon && pnpm build

# 4. Build UI
cd apps/agor-ui && pnpm build

# 5. Copy to agor-live/dist/
cp -r packages/core/dist/* packages/agor-live/dist/core/
cp -r apps/agor-cli/dist/* packages/agor-live/dist/cli/
cp -r apps/agor-daemon/dist/* packages/agor-live/dist/daemon/
cp -r apps/agor-ui/dist/* packages/agor-live/dist/ui/
```

### Running the Build

```bash
cd packages/agor-live
./build.sh
```

**Expected Output**:

```
🏗️  Building agor-live package...
📦 Building @agor/core...
🖥️  Building CLI...
⚙️  Building Daemon...
🎨 Building UI...
📋 Copying build artifacts...
✅ Build complete!
```

---

## Testing Locally

### 1. Build the Package

```bash
cd packages/agor-live
./build.sh
```

### 2. Install Globally

```bash
npm install -g ./packages/agor-live
```

Or from the package directory:

```bash
cd packages/agor-live
npm install -g .
```

### 3. Test Commands

```bash
# Check installation
which agor
which agor-daemon

# Start daemon
agor daemon start

# Check status
agor daemon status

# Test CLI commands
agor session list
agor repo list
agor config

# View logs
agor daemon logs

# Stop daemon
agor daemon stop
```

### 4. Uninstall

```bash
npm uninstall -g agor-live
```

---

## Production Deployment

### Prerequisites

1. NPM account with publish access
2. Repository at https://github.com/agorapp/agor
3. All dependencies published to npm

### Publishing Steps

```bash
# 1. Update version in package.json
cd packages/agor-live
npm version patch  # or minor/major

# 2. Build package
./build.sh

# 3. Test locally (see above)
npm install -g .

# 4. Publish to npm
npm publish

# 5. Verify publication
npm info agor-live
```

### CI/CD (Future)

Recommended GitHub Actions workflow:

```yaml
name: Publish agor-live

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install
      - run: cd packages/agor-live && ./build.sh
      - run: cd packages/agor-live && npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## File Structure Changes

### New Files

```
apps/agor-cli/src/
├── lib/
│   ├── context.ts              # Context detection
│   └── daemon-manager.ts       # Daemon lifecycle utilities
└── commands/
    └── daemon/
        ├── index.ts            # Main daemon command
        ├── start.ts            # Start daemon
        ├── stop.ts             # Stop daemon
        ├── status.ts           # Check status
        ├── logs.ts             # View logs
        └── restart.ts          # Restart daemon

packages/agor-live/
├── bin/
│   ├── agor.js                 # CLI entry point
│   └── agor-daemon.js          # Daemon entry point
├── dist/                       # (generated by build.sh)
├── build.sh                    # Build script
├── package.json                # Package manifest
├── README.md                   # User documentation
├── IMPLEMENTATION.md           # This file
└── .npmignore                  # Publish exclusions
```

### Modified Files

```
apps/agor-daemon/src/index.ts
  → Added static UI serving (lines 161-188)
```

---

## Known Issues & Limitations

### Current Implementation

1. **Manual Daemon Start Required**
   - User must explicitly run `agor daemon start`
   - No auto-start on first CLI command
   - **Rationale**: Explicit control, simpler implementation

2. **No Auto-Update**
   - User must manually run `npm update -g agor-live`
   - **Future**: Could add update notification via health check

3. **Single User Per Machine**
   - Database at `~/.agor/agor.db` is per-user
   - Daemon runs on fixed port (3030)
   - **Future**: Support multi-user via different ports/DB paths

### Development vs Production

The CLI behaves differently based on context:

| Command             | Dev (monorepo)         | Prod (npm)             |
| ------------------- | ---------------------- | ---------------------- |
| `agor daemon start` | ❌ "Use pnpm dev"      | ✅ Starts daemon       |
| `agor daemon stop`  | ❌ "Use Ctrl+C"        | ✅ Stops daemon        |
| `agor session list` | ✅ (if daemon running) | ✅ (if daemon running) |

This prevents confusion when developing Agor itself.

---

## Next Steps

### Phase 4 Completion (Current)

- [x] Add context detection utility
- [x] Add health check with 1s timeout
- [x] Add daemon lifecycle commands
- [x] Add static file serving for UI
- [x] Create `agor-live` package structure
- [x] Write build script
- [x] Create bin entry points
- [x] Configure package.json
- [ ] Test local installation ← **YOU ARE HERE**
- [ ] Publish to npm (when ready)
- [ ] Update main README with npm install instructions

### Future Enhancements

1. **Phase 5: Polish & Documentation**
   - Add `agor ui open` command (opens browser)
   - Add quickstart guide to docs
   - Add video tutorial
   - Document distribution in `context/explorations/single-package.md`

2. **Phase 6: CI/CD**
   - Automate publishing with GitHub Actions
   - Add version bumping with changesets
   - Add release notes generation

3. **Phase 7: Advanced Features**
   - Auto-update notifications
   - Multi-user support (port configuration)
   - Docker distribution (optional)
   - Homebrew formula (macOS)
   - Chocolatey package (Windows)

---

## Comparison with Other Tools

### pm2

```bash
npm install -g pm2
pm2 start app.js
pm2 list
```

**Similar**: Process management, daemon control
**Different**: Agor has UI serving, git integration, WebSocket API

### Vercel CLI

```bash
npm install -g vercel
vercel login
vercel deploy
```

**Similar**: Single package, global install
**Different**: Agor is self-hosted, no cloud dependency

### Prisma

```bash
npm install -g prisma
prisma init
prisma migrate dev
```

**Similar**: CLI + Studio GUI, database management
**Different**: Agor focuses on AI sessions, not database schemas

---

## Design Decisions

### Why Single Package?

**Pros**:

- Simple installation (`npm install -g agor-live`)
- Single version to manage
- UI always matches daemon version
- No CORS configuration needed
- Works offline

**Cons**:

- Larger package size (~12MB vs separate packages)
- Can't update components independently
- Longer build time

**Decision**: Single package wins for better UX

### Why Manual Daemon Start?

**Alternatives Considered**:

1. Auto-start daemon on first CLI command
2. Use systemd/launchd for daemon management
3. Embed daemon in CLI process

**Chosen**: Manual start with `agor daemon start`

**Rationale**:

- Explicit control (no magic)
- User knows daemon state
- Easy to debug (check logs, restart)
- Simple implementation (no platform-specific code)

### Why Bundle Core?

**Alternatives Considered**:

1. Publish `@agor/core` separately as dependency
2. Keep monorepo structure in npm package

**Chosen**: Bundle core into `dist/core/`

**Rationale**:

- Core is internal, not meant for public use
- Simpler versioning (one package version)
- Smaller dependency tree
- Faster npm install

---

## Troubleshooting

### "Command not found: agor"

```bash
# Check if installed
npm list -g agor-live

# Reinstall
npm uninstall -g agor-live
npm install -g agor-live
```

### "Daemon binary not found"

This means the build didn't complete or `dist/` is missing.

```bash
cd packages/agor-live
./build.sh
npm install -g .
```

### "Daemon not running"

```bash
# Check if daemon is actually running
agor daemon status

# View logs for errors
agor daemon logs

# Restart daemon
agor daemon restart
```

### Development vs Production Confusion

If you're developing Agor and accidentally installed the npm package globally:

```bash
# Uninstall global package
npm uninstall -g agor-live

# Use monorepo scripts instead
cd apps/agor-daemon && pnpm dev
```

---

## References

- **Original Design Doc**: `context/explorations/single-package.md`
- **Phase 4 Roadmap**: Lines 477-499 in design doc
- **oclif Documentation**: https://oclif.io/docs/commands
- **FeathersJS Static Files**: https://feathersjs.com/api/express.html
- **NPM Publishing Guide**: https://docs.npmjs.com/cli/v9/commands/npm-publish

---

**Implementation Date**: 2025-01-26
**Implementation By**: Claude Code
**Status**: Ready for Testing
