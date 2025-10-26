# Contributing to Agor

**Use Agor to contribute to Agor!**

The best way to contribute to Agor is by using Agor itself. Create a worktree for your feature, spawn sessions to explore the codebase, use zones to organize your work, and experience the multiplayer workflow firsthand. We dogfood extensively and your experience using Agor to build Agor will inform better contributions.

---

## Getting Started

### Prerequisites

- **Docker** (easiest, recommended for first-time setup)
- **Node.js 18+** and **pnpm 8+** (for uncontainerized development)
- **Git** (obviously!)

### Option 1: Docker Compose (Easiest)

**Fastest way to get Agor running:**

```bash
git clone https://github.com/mistercrunch/agor
cd agor
docker compose up
# Visit http://localhost:5173
# Login: admin@agor.live / admin
```

That's it! No Node.js installation, no pnpm, no dependency management. Docker handles everything.

---

### Option 2: Worktrees + Docker Compose in Parallel

**Want to run multiple Agor instances on different branches?** Perfect for testing features side-by-side or developing multiple features in parallel.

Agor practices what it preaches - we use git worktrees internally. You can run multiple Docker Compose instances on different ports:

**Example: Main branch + feature branch simultaneously**

```bash
# Terminal 1 - Main branch
cd ~/code/agor
docker compose up
# Runs on ports 3030 (daemon) and 5173 (UI)
# Visit http://localhost:5173
```

```bash
# Terminal 2 - Feature branch (different worktree)
cd ~/code/agor-feature-tool-ui
PORT=4030 VITE_PORT=5174 docker compose -p agor-feature-tool-ui up
# Runs on ports 4030 (daemon) and 5174 (UI)
# Visit http://localhost:5174
```

```bash
# Terminal 3 - Another feature
cd ~/code/agor-feature-environments
PORT=5030 VITE_PORT=5175 docker compose -p agor-feature-environments up
# Runs on ports 5030 (daemon) and 5175 (UI)
# Visit http://localhost:5175
```

**Key points:**

- Use different ports via `PORT` and `VITE_PORT` env vars
- Use `-p <project-name>` to isolate Docker volumes/containers
- Each instance gets its own database and configuration
- No conflicts, run as many as you want!

**Port naming convention:**

| Instance  | Daemon Port | UI Port | Project Name              |
| --------- | ----------- | ------- | ------------------------- |
| Main      | 3030        | 5173    | agor (default)            |
| Feature 1 | 4030        | 5174    | agor-feature-tool-ui      |
| Feature 2 | 5030        | 5175    | agor-feature-environments |
| Feature 3 | 6030        | 5176    | agor-feature-sdk-parity   |

**Creating a worktree for your feature:**

```bash
# From main repo
cd ~/code/agor
git worktree add ../agor-feature-tool-ui -b feat/tool-ui-library

# Now you have:
# ~/code/agor (main branch)
# ~/code/agor-feature-tool-ui (feat/tool-ui-library branch)
```

See the [Docker Guide](apps/agor-docs/pages/guide/docker.mdx) for more details.

---

### Option 3: Uncontainerized (Local Development)

**Recommended for active contributors** who are making frequent changes and want fast hot-reload.

**Setup:**

```bash
git clone https://github.com/mistercrunch/agor
cd agor
pnpm install
```

**Two-process development workflow:**

```bash
# Terminal 1: Daemon (watches @agor/core + daemon, auto-restarts on changes)
cd apps/agor-daemon
pnpm dev

# Terminal 2: UI dev server (Vite HMR for instant updates)
cd apps/agor-ui
pnpm dev

# Visit http://localhost:5173
```

**Why uncontainerized?**

- ✅ **Faster iteration** - Vite HMR updates UI instantly, tsx watch restarts daemon on change
- ✅ **Better debugging** - Attach debuggers, inspect network, full access to processes
- ✅ **Editor integration** - TypeScript IntelliSense works across the monorepo
- ✅ **Lower resource usage** - No Docker overhead

**Troubleshooting:**

```bash
# If daemon doesn't restart after @agor/core changes
cd packages/core && pnpm build
cd apps/agor-daemon && pnpm dev

# If tsx watch not picking up changes
cd apps/agor-daemon
rm -rf node_modules/.tsx
pnpm dev

# If port 3030 is in use
lsof -ti:3030 | xargs kill -9
```

**Running multiple instances uncontainerized:**

You can also run multiple instances locally on different ports (without Docker):

```bash
# Terminal 1: Main instance
cd ~/code/agor/apps/agor-daemon
PORT=3030 pnpm dev
# (separate terminal for UI)
cd ~/code/agor/apps/agor-ui
VITE_DAEMON_PORT=3030 pnpm dev

# Terminal 2: Feature instance (different worktree)
cd ~/code/agor-feature-tool-ui/apps/agor-daemon
PORT=4030 pnpm dev
# (separate terminal for UI)
cd ~/code/agor-feature-tool-ui/apps/agor-ui
VITE_DAEMON_PORT=4030 VITE_PORT=5174 pnpm dev
```

---

### Read the Docs

Before diving into code, familiarize yourself with the architecture:

- **[CLAUDE.md](CLAUDE.md)** - Development patterns and project structure
- **[context/README.md](context/README.md)** - Architecture documentation index
- **[context/concepts/core.md](context/concepts/core.md)** - Core primitives and design philosophy

---

## Priority Areas for Contribution

We're actively seeking help in these high-impact areas:

### 🎨 Tool Call UI Library

**The challenge:** Agentic tools use dozens of different tool types (Edit, Write, Bash, WebFetch, etc.), each with unique visualization needs. We need a rich component library that makes tool calls beautiful, informative, and actionable.

**What we need:**

- **Rich diff visualization** for Edit/Write tools (syntax highlighting, side-by-side, inline)
- **Tool-specific components** - File trees for Glob results, syntax-highlighted code blocks for Read, interactive command output for Bash
- **The long tail problem** - Cover edge cases and less common tools (WebSearch results, PDF reads, notebook edits, etc.)
- **Reusable component library** - Make it easy to add new tool visualizations without duplicating code
- **Interactive elements** - Expand/collapse, copy-to-clipboard, jump-to-file, etc.

**Current state:** Basic tool rendering exists, but lacks polish and depth. See `apps/agor-ui/src/components/ToolBlocks/` for what we have.

**Skills needed:** React, Ant Design, TypeScript, design systems, diff algorithms

---

### ⚡ SDK Parity & Feature Catching

**The challenge:** Claude Code, Codex, Gemini, and their underlying CLIs evolve rapidly. New features, tools, and capabilities ship weekly. We need to maintain parity++ with native CLI experiences while adding our rich web UI layer.

**What we need:**

- **Monitor SDK releases** - Track changelogs, test new features, identify gaps
- **Implement missing features** - Bring new tools, capabilities, and workflows into Agor
- **Go beyond parity** - Where CLIs offer text output, we can offer interactive visualizations, persistent history, and multiplayer context
- **Documentation updates** - Keep SDK comparison matrix current (`context/concepts/agentic-coding-tool-integrations.md`)

**Current gaps:**

- Claude Code's latest Task tool features
- Codex permission system edge cases
- Gemini SDK stability improvements
- MCP server capability detection and UI

**Skills needed:** SDK integration, API design, keeping up with AI tool ecosystem

---

### 🔧 Environment Management System

**The challenge:** Running multiple dev servers across worktrees with auto-port allocation, health monitoring, and process lifecycle management is complex. The current implementation works but needs polish.

**What we need:**

- **Better process management** - Graceful shutdown, restart on crash, log rotation
- **Port conflict detection** - Smarter port allocation when suggested ports are taken
- **Health check reliability** - Retry logic, better error messages, timeout handling
- **Multi-service support** - Some projects need multiple processes (backend + frontend + db)
- **Environment templates** - Reusable configs for common stacks (Next.js, Django, Rails, etc.)
- **Docker Compose integration** - First-class support for `docker compose up/down`

**Current state:** Basic start/stop/health works, see `apps/agor-daemon/src/services/environments/` and `apps/agor-ui/src/components/Environment/`

**Skills needed:** Process management, Node.js child processes, Docker, health checks

---

### 🐛 Bug Reports & Fixes

**Always welcome!** Found a bug? Please report it with:

- **Steps to reproduce** - What you did, what happened, what you expected
- **Environment** - OS, Node version, Docker/local, browser
- **Screenshots/logs** - Visual evidence helps immensely
- **Workaround** - If you found one, share it!

**Fix it yourself?** Even better! See [Getting Started](#getting-started) above.

---

### Other High-Impact Areas

**🎯 Board & Canvas UX**

- Drag-and-drop improvements (snap-to-grid, alignment guides)
- Minimap for navigation on large boards
- Keyboard shortcuts for common actions
- Undo/redo for board operations

**💬 Real-Time Collaboration**

- Spatial comments on specific worktrees/sessions
- Presence indicators showing who's active in which session
- Conflict resolution when multiple users edit the same session
- Activity feed showing recent team actions

**🧪 Testing & Coverage**

- Unit tests for core services (sessions, worktrees, boards)
- Integration tests for agent SDK interactions
- E2E tests for critical user flows
- Performance benchmarks for real-time features

**📚 Documentation**

- Tutorials and guides for common workflows
- Video walkthroughs of key features
- API reference improvements
- Architecture deep-dives in `context/` folder

**♿ Accessibility**

- Keyboard navigation for board and sessions
- Screen reader support for conversation UI
- ARIA labels and semantic HTML
- Color contrast improvements

**🚀 Performance**

- Database query optimization
- WebSocket event throttling/debouncing
- React component memoization
- Bundle size reduction

---

## Contribution Workflow

### 1. Fork & Create a Worktree

**In Agor (meta!):**

```bash
# Create a worktree in Agor for your contribution
# Work on it using Agor sessions
# Experience the workflow you're improving!
```

**Or traditionally:**

```bash
git checkout -b feat/your-feature-name
```

**Want to discuss first?** Feel free to open an issue or discussion before coding, but it's not required. Direct PRs are welcome!

### 2. Make Your Changes

**Follow these patterns:**

- **Read before editing** - Always read files before modifying
- **Type-driven development** - Use branded types for IDs, strict TypeScript
- **Centralize types** - Import from `packages/core/src/types/`, never redefine
- **Use `simple-git`** - NEVER use `execSync`, `spawn`, or subprocess for git operations
- **Edit over Write** - Prefer editing existing files when possible

**Code style:**

- TypeScript strict mode
- ESLint + Prettier (run `pnpm lint` before committing)
- Meaningful variable names
- Comments for non-obvious logic

### 3. Test Your Changes

```bash
# Type checking
pnpm typecheck

# Lint
pnpm lint

# Manual testing
# - Create a session in Agor
# - Test your feature end-to-end
# - Check for console errors in browser/daemon logs
```

**We need more automated tests!** Adding tests with your PR is highly valued.

### 4. Commit & Push

**Commit message format:**

```
<type>: <short description>

<optional longer description>

<optional footer>
```

**Types:**

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring without behavior change
- `test:` - Adding or updating tests
- `chore:` - Tooling, dependencies, configs

**Examples:**

```
feat: add rich diff visualization for Edit tool

Implements side-by-side and inline diff views using react-diff-view.
Adds syntax highlighting and expand/collapse for large diffs.

Closes #123
```

```
fix: environment health check timeout handling

Health checks now retry 3 times with exponential backoff before
marking environment as unhealthy.
```

### 5. Open a Pull Request

**PR title:** Same format as commit messages

**PR description should include:**

- **What** - What does this PR do?
- **Why** - Why is this change needed?
- **How** - Brief explanation of approach (if non-obvious)
- **Testing** - How did you test this? What should reviewers check?
- **Screenshots** - For UI changes, always include before/after screenshots
- **Closes #XXX** - Link to related issue(s)

**Example PR description:**

```markdown
## What

Adds rich diff visualization for Edit tool with syntax highlighting and side-by-side view.

## Why

The current Edit tool output is plain text, making it hard to review what changed.
Developers need to see diffs clearly to understand agent actions.

## How

- Uses `react-diff-view` for rendering
- Integrates with `highlight.js` for syntax highlighting
- Adds expand/collapse for diffs >100 lines
- Supports both unified and split view modes

## Testing

- Created a session that edits TypeScript files
- Verified syntax highlighting works for TS, JS, Python, Rust
- Tested expand/collapse with large diffs (500+ lines)
- Checked mobile responsiveness

## Screenshots

### Before

![before](...)

### After

![after](...)

Closes #123
```

---

## Code Review Process

**What to expect:**

- Reviews usually happen within 2-3 days
- Maintainers may request changes or ask questions
- CI checks must pass (linting, type checking)
- At least one maintainer approval required

**Making changes:**

- Push new commits to your PR branch
- Respond to review comments
- Mark conversations as resolved when addressed

**After merge:**

- Your PR will be merged via squash commit
- You'll be added to contributors list
- Feature will ship in next release

---

## Community Guidelines

**Be respectful and constructive**

- Assume good intent
- Provide actionable feedback
- Celebrate contributions, no matter how small

**Ask questions!**

- Confused about architecture? Ask in Discussions
- Stuck on implementation? Open a draft PR and ask for guidance
- Found unclear docs? Ask AND submit a fix!

**Collaborate in public**

- Use GitHub Issues/Discussions for questions (not DMs)
- Share your learnings and solutions
- Help other contributors when you can

---

## Getting Help

**Stuck? Confused? Need guidance?**

- **[GitHub Discussions](https://github.com/mistercrunch/agor/discussions)** - Ask questions, share ideas, get help
- **[GitHub Issues](https://github.com/mistercrunch/agor/issues)** - Report bugs, request features
- **Read the docs** - [CLAUDE.md](CLAUDE.md) and [context/](context/) have extensive documentation

**Response time:**

- Discussions: Usually within 24-48 hours
- Issues/PRs: Within 2-3 days
- Critical bugs: Within 24 hours

---

## Recognition

**All contributors are valued!** We recognize contributions through:

- **Contributors list** in README
- **Release notes** crediting contributors
- **GitHub badges** for merged PRs
- **Maintainer nomination** for sustained, high-quality contributions

---

## License

By contributing to Agor, you agree that your contributions will be licensed under the [Business Source License 1.1](LICENSE).

---

**Thank you for considering contributing to Agor!**

Your contributions make this project better for everyone. Whether you're fixing a typo, improving docs, or building a major feature - every contribution matters.

**Remember: Use Agor to contribute to Agor!** Experience the tool, find the rough edges, and help us smooth them out.

Let's build the future of multiplayer AI development together. 🚀
