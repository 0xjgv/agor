# CLI Architecture

## Overview

While Agor is primarily a rich GUI for organizing complex "session trees" across boards, terminal-based workflows are essential for developers. Since Agor federates all sessions and augments them with metadata, the CLI should enable core operations: listing sessions, resuming them, forking, spawning subtasks, and managing all first-class entities.

**Key Insight:** The CLI acts as both a standalone tool for session management AND an orchestration layer that can launch agentic coding CLIs (Claude Code, Cursor, etc.) with the right context pre-loaded.

## Framework Selection

### Recommended: **oclif**

After evaluating the major TypeScript CLI frameworks, **oclif** is the optimal choice for Agor:

**Why oclif:**
- **Plugin architecture** - Critical for extensibility (agent integrations, custom commands)
- **First-class TypeScript support** - Type safety for all our primitives
- **Hierarchical commands** - Natural fit for entity-based subcommand structure
- **Battle-tested** - Powers Heroku & Salesforce CLIs (millions of daily interactions)
- **Auto-documentation** - Generates help text from TypeScript types
- **Enterprise-ready** - Built for complex, large-scale CLI applications

**Trade-offs:**
- Steeper learning curve than Commander (acceptable for our complexity)
- More opinionated setup (beneficial for consistency)
- Heavier than needed for simple CLIs (not a concern given our scope)

**Alternatives considered:**
- **Commander** - Too lightweight for plugin system needs
- **Yargs** - Strong candidate, but lacks plugin architecture
- **Ink** - React-based, overkill for our data-focused CLI

### Table Rendering: **cli-table3**

For rich data tables (session lists, task timelines, etc.):

**Features:**
- Unicode-aided tables with custom styles
- Column/row spanning
- Per-cell customization (borders, colors, padding)
- Vertical alignment & word wrapping
- TypeScript type definitions included
- Active maintenance (successor to cli-table/cli-table2)

**npm:** `cli-table3` (0.6.5+)

## Command Structure

### Entity-Based Architecture

Each core primitive gets a top-level command with CRUD + custom operations:

```
agor <entity> <operation> [options]
```

**Entities (Top-Level Commands):**
1. `board` - Board management
2. `session` - Session orchestration (primary command)
3. `task` - Task operations
4. `concept` - Concept management
5. `report` - Report viewing/generation

### Core Commands by Entity

#### `agor session` (Primary Command)

**List/Browse:**
- `agor session list [--board <name>] [--status <status>] [--agent <agent>]`
  - Rich table: ID, prompt (truncated), agent, status, tasks, git ref, modified
  - Filter by board, status (running/idle/completed/failed), agent type
  - Sort by: recent, active, board

**Lifecycle:**
- `agor session start [options]`
  - Options: `--agent <agent>`, `--board <board>`, `--prompt <text>`, `--repo <slug>`, `--worktree <name>`, `--no-worktree`
  - Interactive workflow if options not provided:
    1. Prompt for task description (multi-line)
    2. Detect git repo in current directory
    3. Ask: "Use Agor-managed worktree? [Y/n]" (recommended)
    4. If yes: Suggest worktree name (from prompt slug), check for remote branch
    5. If no repo added: Offer to `agor repo add` (clone to ~/.agor/repos/)
    6. Create worktree at `~/.agor/worktrees/{repo-slug}/{name}`
    7. Agent selection (or use active context)
    8. Launch agent CLI in worktree directory
  - Creates session, links to repo/worktree
  - Launches agent CLI with context loaded

- `agor session resume <session-id>`
  - Accepts full UUID or short ID (8+ chars)
  - Resolves short ID to full UUID automatically
  - Changes to session's working directory (worktree or user directory)
  - Loads session context, resumes agent CLI at current state
  - Shows recent tasks/commits before resuming

- `agor session fork <session-id> [--prompt <text>]`
  - Accepts full UUID or short ID
  - Creates sibling session (genealogy: fork)
  - Copies concept set, starts from same base_sha
  - Optionally provide new prompt, otherwise interactive input
  - Launches agent CLI in new session

- `agor session spawn <session-id> [--prompt <text>]`
  - Accepts full UUID or short ID
  - Creates child session (genealogy: spawn)
  - Inherits concepts, starts from current_sha of parent
  - Delegates subtask, maintains parent relationship
  - Launches agent CLI in new session

**Metadata:**
- `agor session show <session-id>`
  - Detailed view: genealogy tree, all tasks, concepts, git state
  - ASCII tree diagram for family relationships

- `agor session concepts <session-id> [--add <concept>] [--remove <concept>]`
  - List/modify concept tags for session

- `agor session tree <session-id>`
  - ASCII tree visualization of session family
  - Shows forks (dashed) vs spawns (solid) relationships

**CRUD:**
- `agor session delete <session-id> [--force]`
  - Archive session (soft delete by default)
  - `--force` for hard delete (warn about children)

#### `agor repo`

**Repository Management:**
- `agor repo add <git-url> [--slug <name>]`
  - Clone repository to `~/.agor/repos/{slug}` as bare clone
  - Enables Agor-managed worktree creation
  - Auto-detects default branch
  - Optionally creates initial worktree

- `agor repo list`
  - Table: Slug, remote URL, worktree count, session count

- `agor repo show <slug>`
  - Repository details, worktrees, active sessions
  - Shows worktree table with usage info

- `agor repo remove <slug> [--force]`
  - Remove repository and all worktrees
  - Requires confirmation if active sessions exist
  - Updates sessions to orphaned state

**Worktree Management:**
- `agor repo worktree add <repo-slug> <name> [--ref <branch>]`
  - Create worktree at `~/.agor/worktrees/{repo-slug}/{name}`
  - Auto-detects if remote branch exists (offers to track)
  - Creates new local branch if needed

- `agor repo worktree list [<repo-slug>]`
  - List all worktrees (all repos or specific repo)
  - Table: Name, branch, sessions, last used

- `agor repo worktree remove <repo-slug> <name>`
  - Remove worktree directory
  - Warns if active sessions exist
  - Updates database and git metadata

- `agor repo worktree prune [<repo-slug>]`
  - Cleanup stale worktree metadata
  - Removes entries for manually deleted directories

**See:** `context/explorations/git-worktree.md` for complete worktree strategy.

---

#### `agor board`

- `agor board list`
  - Table: Name, session count, active sessions, last modified

- `agor board create <name> [--description <text>] [--slug <slug>]`
  - Create new board
  - Slug optional (auto-generated from name)

- `agor board show <board-name>`
  - List all sessions on board with rich table
  - Accepts board name, slug, or ID

- `agor board move <session-id> <board-name>`
  - Move session to different board

- `agor board delete <board-name> [--archive-sessions]`
  - Delete board, optionally archive sessions

#### `agor task`

- `agor task list <session-id> [--status <status>]`
  - Table: Task #, prompt (truncated), status, tools used, git state, duration

- `agor task show <session-id> <task-number>`
  - Full task details: complete prompt, message range, tool usage, git commits

- `agor task add <session-id> --prompt <text>`
  - Add task to session (for planning/backlog)

- `agor task complete <session-id> <task-number>`
  - Mark task complete (usually auto-tracked, but manual override)

#### `agor concept`

- `agor concept list [--type <type>]`
  - Table: Name, type (core/exploration/custom), usage count, last used

- `agor concept show <concept-name>`
  - Display concept content
  - List sessions using this concept

- `agor concept create <name> --file <path>`
  - Register new concept from markdown file

- `agor concept attach <concept-name> <session-id>`
  - Add concept to session's context

- `agor concept detach <concept-name> <session-id>`
  - Remove concept from session

#### `agor report`

- `agor report list [<session-id>]`
  - Table: Task #, report type, generated date, concepts extracted
  - Session ID optional if active session set

- `agor report show [<session-id>] <task-number>`
  - Display full report markdown
  - Session ID optional if active session set

- `agor report generate [<session-id>] <task-number>`
  - Manually trigger report generation (usually auto)
  - Session ID optional if active session set

- `agor report export [<session-id>] --format <md|json>`
  - Export all reports for session
  - Session ID optional if active session set

#### `agor config`

**View/Get:**
- `agor config`
  - Show all current config and active context

- `agor config get <key>`
  - Get specific config value
  - Examples: `board`, `session`, `agent`, `cwd`

**Set/Unset:**
- `agor config set <key> <value>`
  - Set active context value
  - Accepts short IDs or slugs for board/session
  - Examples:
    - `agor config set board experiments`
    - `agor config set session 01933e4a`
    - `agor config set agent claude-code`

- `agor config unset <key>`
  - Clear specific context value

- `agor config clear`
  - Clear all active context

**Edit:**
- `agor config edit`
  - Open config file in $EDITOR

- `agor config path`
  - Show path to config file

### Global Flags

```
--json              # Output as JSON instead of tables (for scripting)
--verbose, -v       # Detailed logging
--quiet, -q         # Minimal output
--config <path>     # Override config file location
--help, -h          # Show help
```

## Agent Orchestration

### Launching Agent CLIs

When commands like `start`, `resume`, `fork`, `spawn` are invoked:

1. **Validate agent availability** - Check if agent CLI is installed/configured
2. **Prepare session context** - Bundle concepts, git state, genealogy
3. **Execute agent CLI** - Pass context via:
   - Environment variables (e.g., `AGOR_SESSION_ID`)
   - Config files (e.g., `.agor/session-context.json`)
   - CLI flags (e.g., `--context-file <path>`)

**Agent-specific adapters:**

```typescript
interface AgentAdapter {
  name: string;                    // "claude-code" | "cursor" | "codex" | "gemini"
  isInstalled(): Promise<boolean>;
  launchCommand(context: SessionContext): string[];
  environmentVars(context: SessionContext): Record<string, string>;
}
```

**Example: Claude Code adapter**

```bash
# Agor prepares context
$ agor session start --agent claude-code --prompt "Add auth middleware"

# Internally executes:
AGOR_SESSION_ID=abc123 \
AGOR_CONCEPTS="auth,security,middleware" \
claude --context-file /tmp/agor-session-abc123.json
```

### Single-Prompt Mode

All session commands support `--prompt` for scriptable workflows:

```bash
# Start session with inline prompt
agor session start --agent claude-code --prompt "Fix CORS issue in API"

# Fork session with new direction
agor session fork abc123 --prompt "Try alternative approach with nginx"

# Spawn subtask session
agor session spawn abc123 --prompt "Write tests for auth middleware"
```

**Without `--prompt`:**
- Interactive multi-line input (Inquirer.js)
- Shows context hints (current branch, concepts, parent prompt)
- Preview before launching agent

## Data Display Patterns

### Session List Table

```
┌──────────┬─────────────────────────────────┬──────────────┬───────────┬───────┬──────────────┬──────────────┐
│ ID       │ Prompt                          │ Agent        │ Status    │ Tasks │ Git Ref      │ Modified     │
├──────────┼─────────────────────────────────┼──────────────┼───────────┼───────┼──────────────┼──────────────┤
│ abc123   │ Add authentication middleware   │ claude-code  │ ● Running │ 3/5   │ feat/auth    │ 2 mins ago   │
│ def456   │ Fix CORS configuration in API   │ cursor       │ ✓ Done    │ 8/8   │ fix/cors     │ 1 hour ago   │
│ ghi789   │ Implement session caching       │ codex        │ ○ Idle    │ 2/10  │ perf/cache   │ 3 hours ago  │
└──────────┴─────────────────────────────────┴──────────────┴───────────┴───────┴──────────────┴──────────────┘
```

**Color coding:**
- Running: Blue spinner (●)
- Completed: Green checkmark (✓)
- Failed: Red cross (✗)
- Idle: Gray circle (○)

### Task Timeline Table

```
┌────┬─────────────────────────────────────────┬───────────┬───────┬──────────────┬──────────┐
│ #  │ Prompt                                  │ Status    │ Tools │ Git State    │ Duration │
├────┼─────────────────────────────────────────┼───────────┼───────┼──────────────┼──────────┤
│ 1  │ Setup auth middleware structure         │ ✓ Done    │ 12    │ a1b2c3d      │ 3m 24s   │
│ 2  │ Implement JWT validation                │ ✓ Done    │ 8     │ e4f5g6h      │ 5m 12s   │
│ 3  │ Add refresh token logic                 │ ● Running │ 4     │ e4f5g6h-dirty│ 2m 18s   │
│ 4  │ Write integration tests                 │ ○ Pending │ -     │ -            │ -        │
│ 5  │ Update API documentation                │ ○ Pending │ -     │ -            │ -        │
└────┴─────────────────────────────────────────┴───────────┴───────┴──────────────┴──────────┘
```

### Session Genealogy Tree (ASCII)

```
agor session tree abc123

Session Tree for abc123: "Add authentication middleware"

root-session [1a2b3c4]
│
├─(fork)─> abc123 [feat/auth] ● Running
│          "Add authentication middleware"
│          ├─(spawn)─> xyz789 [feat/auth-tests] ✓ Done
│          │          "Write auth middleware tests"
│          │
│          └─(spawn)─> pqr456 [feat/auth-docs] ○ Idle
│                     "Document auth flow"
│
└─(fork)─> def456 [fix/cors] ✓ Done
           "Fix CORS configuration"

Legend: (fork) = branching decision | (spawn) = delegated subtask
        ● Running | ✓ Done | ✗ Failed | ○ Idle
```

## Configuration

### Stateful CLI Context (`agor config`)

**Philosophy:** Reduce repetitive typing by setting context that persists across commands.

**Two-tier configuration:**
1. **Global config** (`~/.agor/config.json`) - Persistent settings
2. **Active context** (`~/.agor/context.json`) - Current working state

#### `agor config` Commands

**View Current Context:**
```bash
# Show all config values
agor config

# Show specific key
agor config get board
agor config get session
```

**Set Context (Active State):**
```bash
# Set active board
agor config set board experiments
agor config set board 01933e4a  # or by ID

# Set active session (for task commands)
agor config set session 01933e4a

# Set active agent (for new sessions)
agor config set agent claude-code

# Set working directory context
agor config set cwd /path/to/project
```

**Unset Context:**
```bash
agor config unset board
agor config unset session
agor config clear  # Clear all active context
```

**Edit Config File:**
```bash
agor config edit  # Opens ~/.agor/config.json in $EDITOR
```

---

### Config File Structure

**Global Config:** `~/.agor/config.json`

```json
{
  "storage": {
    "type": "local",  // or "cloud" in future
    "path": "~/.agor/sessions.db"
  },
  "agents": {
    "default": "claude-code",
    "claude-code": {
      "path": "/usr/local/bin/claude",
      "contextMethod": "env-vars"
    },
    "cursor": {
      "path": "/usr/local/bin/cursor",
      "contextMethod": "config-file"
    }
  },
  "display": {
    "tableStyle": "unicode",  // unicode | ascii | minimal
    "colorOutput": true,
    "truncatePrompts": 120,
    "shortIdLength": 8
  },
  "git": {
    "autoCommit": true,
    "worktreeRoot": "~/.agor/worktrees"
  },
  "defaults": {
    "board": "main",        // Default board for new sessions
    "agent": "claude-code"  // Default agent for new sessions
  }
}
```

**Active Context:** `~/.agor/context.json`

```json
{
  "board": "experiments",           // Active board (slug or ID)
  "session": "01933e4a",           // Active session (for task commands)
  "agent": "claude-code",          // Preferred agent for new sessions
  "cwd": "/Users/max/code/myapp",  // Working directory
  "lastCommand": "session list",   // Last command run (for history)
  "updatedAt": "2025-01-15T10:30:00Z"
}
```

---

### Context Resolution Priority

Commands resolve values in this order:

1. **Explicit flags** (highest priority)
2. **Active context** (`~/.agor/context.json`)
3. **Global defaults** (`~/.agor/config.json`)
4. **Interactive prompts** (if required and not set)

**Example:**
```bash
# Set active board
agor config set board experiments

# Uses active board (experiments)
agor session list

# Override with explicit flag
agor session list --board main

# Active board unchanged (still experiments)
agor config get board
# => experiments
```

---

### Config Output Display

**`agor config` (show all):**
```
Current Configuration
─────────────────────

Active Context:
  board:   experiments (01933e4a)
  session: 01933e4a-7b89-7c35-a8f3-9d2e1c4b5a6f
  agent:   claude-code
  cwd:     /Users/max/code/myapp

Global Defaults:
  storage:        ~/.agor/sessions.db
  default agent:  claude-code
  default board:  main
  table style:    unicode
  color output:   enabled

Config Files:
  global:  ~/.agor/config.json
  context: /Users/max/code/myapp/.agor/context.json

Last updated: 2 minutes ago
```

**`agor config get board`:**
```
experiments
```

---

### Stateful Workflow Examples

**Example 1: Working on a specific board**
```bash
# Set context
agor config set board experiments

# All commands now default to experiments board
agor session list
agor session start --prompt "Try new approach"
agor session resume 01933e4a

# Switch boards
agor config set board bug-fixes
agor session list  # Now shows bug-fixes sessions
```

**Example 2: Deep-diving into a session**
```bash
# Set active session
agor config set session 01933e4a

# Task commands don't need session ID
agor task list              # Instead of: agor task list 01933e4a
agor task show 3            # Instead of: agor task show 01933e4a 3
agor task add --prompt "Write tests"

# Session commands still work
agor session show           # Shows active session
agor session resume         # Resumes active session
```

**Example 3: Multi-project workflow**
```bash
# Project 1
cd ~/code/frontend
agor config set cwd $(pwd)
agor config set board frontend-work
agor session start --prompt "Add dark mode"

# Project 2
cd ~/code/backend
agor config set cwd $(pwd)
agor config set board backend-work
agor session start --prompt "Optimize queries"

# Context is per-directory (if implemented with .agor/context.json)
```

**Example 4: Context-aware shortcuts**
```bash
# Long form without context
agor task list 01933e4a
agor task show 01933e4a 3
agor task add 01933e4a --prompt "Fix bug"

# With active session set
agor config set session 01933e4a
agor task list
agor task show 3
agor task add --prompt "Fix bug"
```

---

### Contextual Attributes

**Attributes that make sense for active context:**

| Attribute | Purpose | Commands Affected | Persistence |
|-----------|---------|-------------------|-------------|
| `board` | Active board for session operations | `session list`, `session start` | Until changed |
| `session` | Active session for task operations | `task list/show/add`, `session show/resume/fork/spawn` | Until changed |
| `agent` | Preferred agent for new sessions | `session start` | Until changed |
| `cwd` | Working directory context | All commands (project-scoped) | Per-directory |
| `concepts` | Default concepts for new sessions | `session start` | Until changed |
| `reportTemplate` | Default report template | Task completion | Until changed |

**Additional context ideas:**

| Attribute | Use Case |
|-----------|----------|
| `defaultPromptTemplate` | Pre-fill session prompts with template |
| `autoResume` | Auto-resume last active session on `agor` without args |
| `verbosity` | Default verbosity level (quiet/normal/verbose) |
| `pager` | Enable/disable paging for long output |

---

### Context Scoping

**Option 1: Global context** (simplest)
- Single `~/.agor/context.json` for all projects
- Context applies everywhere

**Option 2: Per-directory context** (git-style)
- Look for `.agor/context.json` in current directory
- Walk up directory tree to find context
- Fallback to `~/.agor/context.json`

**Option 3: Per-project context** (recommended)
- Detect git root or project root
- Use `.agor/context.json` in project root
- Allows different contexts per codebase

**Implementation:**
```typescript
function findContextFile(): string {
  // Check current directory
  if (fs.existsSync('.agor/context.json')) {
    return path.resolve('.agor/context.json');
  }

  // Check git root
  const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const gitContextPath = path.join(gitRoot, '.agor/context.json');
  if (fs.existsSync(gitContextPath)) {
    return gitContextPath;
  }

  // Fallback to global
  return path.join(os.homedir(), '.agor/context.json');
}
```

---

### `~/.agor/` Directory Structure

**Agor maintains a dedicated directory for all managed resources:**

```
~/.agor/
├── config.json              # Global configuration
├── context.json             # Active context (stateful CLI)
├── sessions.db              # LibSQL database (sessions, tasks, boards, repos, worktrees)
│
├── repos/                   # Agor-managed bare repositories
│   ├── myapp/              # Bare clone (slug: myapp)
│   │   ├── config
│   │   ├── HEAD
│   │   ├── objects/
│   │   └── refs/
│   └── backend/            # Bare clone (slug: backend)
│       └── ...
│
├── worktrees/              # Agor-managed worktrees
│   ├── myapp/
│   │   ├── main/          # Worktree on main branch
│   │   ├── feat-auth/     # Worktree on feat-auth branch
│   │   ├── fix-cors/      # Worktree on fix-cors branch
│   │   └── exp-rewrite/   # Worktree for experiment
│   └── backend/
│       ├── main/
│       └── api-v2/        # Worktree on api-v2 branch
│
└── temp/                   # Temporary files
    ├── session-contexts/  # Agent session context JSON
    └── locks/             # File locks for concurrent operations
```

**Disk Usage:**
- Bare repo: ~same as regular clone
- Each worktree: Only working tree files (no .git duplication)
- Example: 100MB repo + 3 worktrees ≈ 100MB + 3×(source files)

**Management:**
- Use `agor repo add` to clone repos to `~/.agor/repos/`
- Use `agor repo worktree add` to create worktrees in `~/.agor/worktrees/`
- Sessions automatically reference worktrees via `repo.cwd` field

**See:** `context/explorations/git-worktree.md` for complete details.

---

### Environment Variables

```bash
AGOR_CONFIG_PATH=~/.agor/config.json
AGOR_CONTEXT_PATH=~/.agor/context.json  # Override context file location
AGOR_SESSION_ID=<current-session-id>    # Set by Agor when launching agent
AGOR_CONCEPTS=<comma-separated-list>    # Concepts for current session
AGOR_PARENT_SESSION=<parent-session-id> # For spawn/fork operations
AGOR_GENEALOGY_TYPE=<fork|spawn>        # Relationship type
AGOR_WORKTREE_PATH=<worktree-path>      # Path to worktree (if managed)
```

## Implementation Phases

### Phase 1: Core CLI (MVP)
- oclif setup with TypeScript
- `agor session list/show/start/resume`
- `agor board list/show`
- `agor task list/show`
- cli-table3 integration for rich output
- Basic agent adapter (Claude Code only)
- Local SQLite storage integration

### Phase 2: Orchestration
- `agor session fork/spawn` with genealogy tracking
- Agent adapter framework (multi-agent support)
- Interactive prompts (Inquirer.js integration)
- `--prompt` flag for scripting workflows
- Session context bundling & injection

### Phase 3: Advanced Features
- `agor concept` commands (attach/detach/list)
- `agor report` commands (generate/view/export)
- `agor session tree` ASCII visualization
- `--json` output mode for scripting
- Plugin system for custom commands

### Phase 4: Cloud Integration (V2)
- Cloud storage backend (`agor login`)
- Collaborative session sharing
- Real-time sync for multi-device workflows
- Cloud-hosted agent orchestration

## Technical Considerations

### Session Context Injection

**Method 1: Environment Variables** (Simplest)
```bash
AGOR_SESSION_ID=abc123
AGOR_CONCEPTS=auth,security
```

**Method 2: Config File** (Richest)
```json
// /tmp/agor-session-abc123.json
{
  "sessionId": "abc123",
  "board": "main",
  "concepts": ["auth", "security", "middleware"],
  "gitState": {
    "ref": "feat/auth",
    "baseSha": "a1b2c3d",
    "currentSha": "e4f5g6h-dirty"
  },
  "genealogy": {
    "parent": "root-session",
    "type": "fork"
  },
  "recentTasks": [...]
}
```

**Method 3: CLI Flags** (Agent-specific)
```bash
claude --session abc123 --concepts auth,security
```

### State Management

**During Agent Session:**
- Agent CLI writes state updates to Agor DB
- Use file watchers or IPC for real-time sync
- Graceful shutdown handlers to finalize session state

**State Transitions:**
- `start` → Creates session record, sets status=running
- `resume` → Updates status=running, sets resumed_at timestamp
- `fork/spawn` → Creates new session, links genealogy, copies/inherits context
- Agent exit → Updates status=idle/completed/failed, finalizes git state

### Short ID Resolution

**All commands accept both full UUIDs and short ID prefixes.**

**Full UUID (36 chars):**
```bash
agor session resume 01933e4a-7b89-7c35-a8f3-9d2e1c4b5a6f
```

**Short ID (8+ chars, recommended):**
```bash
agor session resume 01933e4a
```

**Resolution Algorithm:**

1. **Normalize input** - Strip hyphens, convert to lowercase
2. **Query database** - `WHERE session_id LIKE 'prefix%'`
3. **Exact match** - Return session if only one match
4. **No matches** - Error with suggestion to list sessions
5. **Multiple matches** - Error with suggestions to use longer prefix

**Example: Unique Match**
```bash
$ agor session resume 01933e4a

Resuming session 01933e4a: "Add authentication middleware"
Last updated: 5 minutes ago
Recent tasks:
  #3 Implement JWT validation (running)
  #2 Setup auth middleware (completed)
  #1 Plan auth architecture (completed)

Launching claude-code...
```

**Example: Ambiguous Prefix**
```bash
$ agor session resume 0193

✗ Error: Ambiguous ID prefix: 0193

  3 matches found:
  - 01933e4a7b89: "Add authentication middleware"
  - 0193416c2d4f: "Add auth tests"
  - 01935abc9def: "Add authorization layer"

  Use a longer prefix to disambiguate:
    agor session resume 01933e4a
```

**Example: Not Found**
```bash
$ agor session resume xyz999

✗ Error: No session found with ID prefix: xyz999

  List available sessions: agor session list
```

**Implementation:**

The CLI uses `resolveShortId()` from `@/lib/ids` to handle all ID resolution:

```typescript
import { resolveShortId } from '@/lib/ids';

async function resumeSession(idPrefix: string) {
  const allSessions = await db.select().from(sessions).all();

  try {
    const session = resolveShortId(idPrefix, allSessions);
    // Proceed with resume...
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
```

**Performance:**

- Database query uses B-tree index on `session_id` (O(log n))
- Prefix matching via `LIKE 'prefix%'` is efficient
- Typically returns 1-10 candidates for disambiguation
- No additional indexes needed

**See:** `context/concepts/id-management.md` for complete ID strategy.

---

### Error Handling

**Agent Not Installed:**
```bash
$ agor session start --agent cursor
✗ Error: Agent 'cursor' is not installed or configured

  Install cursor: https://cursor.sh/install
  Or configure path: agor config set agents.cursor.path <path>
```

**Git Conflicts:**
```bash
$ agor session fork abc123
⚠ Warning: Current branch has uncommitted changes

  Options:
  1. Commit changes first
  2. Stash changes: git stash
  3. Force fork (creates dirty state): --force
```

## Future Enhancements

### Plugin System (oclif plugins)

```bash
# Community plugins for custom agents
agor plugins install @agor/agent-gemini
agor plugins install @agor/agent-copilot

# Custom workflow plugins
agor plugins install @agor/workflow-tdd
agor session start --workflow tdd --prompt "Build user auth"
```

### AI-Assisted Command Generation

```bash
$ agor ai "show me all failed sessions from last week on the experiments board"

Suggested command:
  agor session list --board experiments --status failed --since 7d

Run this command? [Y/n]
```

### Integration with GUI

```bash
# Open current session in GUI
agor session open abc123 --gui

# Launch GUI at specific board
agor board show experiments --gui
```

### Session Replay

```bash
# Replay session task-by-task (for demos/learning)
agor session replay abc123 --speed 2x

# Export session as video/GIF
agor session export abc123 --format gif --output demo.gif
```

## References

**CLI Frameworks:**
- oclif: https://oclif.io
- cli-table3: https://github.com/cli-table/cli-table3
- Inquirer.js: https://github.com/SBoudrias/Inquirer.js

**Related Agor Docs:**
- `context/concepts/core.md` - Core primitives (Session, Task, Concept)
- `context/concepts/models.md` - Data model definitions
- `context/concepts/architecture.md` - System design & storage
- `context/explorations/agent-interface.md` - Agent abstraction layer
- `context/explorations/state-management.md` - Persistence layer (Drizzle + LibSQL)
