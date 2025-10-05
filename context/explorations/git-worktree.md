# Git Worktree Management

**Category:** Exploration
**Status:** Design Phase (January 2025)

Related: [[cli]], [[models]], [[architecture]]

---

## Overview

Git worktrees are **critical for parallel AI-assisted development**. They allow multiple branches to be checked out simultaneously in separate directories, eliminating the context-switching overhead of branch switching.

**Key Insight:** AI coding workflows (Claude Code, Cursor, etc.) benefit immensely from worktrees because:
- No stashing/committing WIP to switch branches
- Test experimental approaches in parallel
- Run multiple agent sessions simultaneously on different branches
- Fork/spawn sessions naturally map to worktrees

**Agor's Approach:** Optionally manage worktrees for users, making parallel development workflows seamless.

---

## The Problem: Branch Switching in AI Workflows

**Traditional workflow pain:**
```bash
# Working on feat-auth with Claude Code
$ claude "Add JWT validation"
# ... agent makes changes, uncommitted ...

# Need to quickly fix a bug on main
$ git stash  # Lose agent context
$ git checkout main
$ git checkout -b fix-cors
$ claude "Fix CORS issue"
# ... fix complete ...

# Resume auth work
$ git checkout feat-auth
$ git stash pop  # Context lost, manual recovery
```

**Worktree workflow (better):**
```bash
# Working on feat-auth
$ cd ~/.agor/worktrees/myapp/feat-auth
$ claude "Add JWT validation"

# Fix bug on main (in parallel)
$ cd ~/.agor/worktrees/myapp/fix-cors
$ claude "Fix CORS issue"

# Resume auth work (context preserved)
$ cd ~/.agor/worktrees/myapp/feat-auth
# All changes intact, agent picks up where it left off
```

**Agor workflow (best):**
```bash
# Working on feat-auth
$ agor session start --prompt "Add JWT validation"
# Agor creates worktree, launches agent

# Fix bug (Agor manages worktree)
$ agor session start --prompt "Fix CORS issue"
# New worktree auto-created

# Resume auth work
$ agor session resume feat-auth
# Agor switches to feat-auth worktree
```

---

## Worktree Basics

### What is a Git Worktree?

A worktree is an additional working directory linked to the same git repository. The main benefits:
- Multiple branches checked out simultaneously
- Shared .git metadata (saves disk space vs. multiple clones)
- Independent working directories (no conflicts)

**Traditional setup:**
```
myapp/
└── .git/          # Git metadata
    └── ...
```

**With worktrees:**
```
myapp/             # Main worktree (bare clone recommended)
├── .git/
└── worktrees/
    ├── feat-auth/     # Worktree on feat-auth branch
    ├── fix-cors/      # Worktree on fix-cors branch
    └── exp-rewrite/   # Worktree on exp-rewrite branch
```

### Native Git Commands

```bash
# Clone as bare repo (recommended for worktrees)
git clone --bare https://github.com/user/repo.git ~/repos/myapp

# Create worktree
git worktree add ../worktrees/feat-auth feat-auth

# List worktrees
git worktree list

# Remove worktree
git worktree remove feat-auth

# Cleanup stale metadata
git worktree prune
```

---

## Agor's Worktree Management

### Philosophy

**Opt-in, not required:**
- Users can choose Agor-managed worktrees or use their own directories
- Agor asks during session creation: "Use Agor-managed worktree? [Y/n]"
- Default: Yes (recommended), but respects user preference

**Slug-based naming:**
- Worktrees use URL-friendly slugs (e.g., "feat-auth", "fix-cors")
- Slug becomes both directory name and (optionally) branch name
- User provides slug during session creation

**Automatic setup:**
- Agor detects git repo in current directory
- Offers to create worktree with suggested name (from prompt)
- Checks for remote branches and offers to track them
- Launches agent CLI in worktree directory

---

## `~/.agor/` Directory Structure

**Complete layout:**

```
~/.agor/
├── config.json              # Global configuration
├── context.json             # Active context (stateful CLI)
├── sessions.db              # LibSQL database (sessions, tasks, boards, repos)
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

**Disk usage:**
- Bare repo: ~same as regular clone
- Each worktree: Only working tree files (no .git duplication)
- Example: 100MB repo + 3 worktrees = ~100MB + 3×(working tree size)

---

## Repository Management

### Adding a Repository

**CLI:** `agor repo add <git-url> [--slug <name>]`

**Flow:**
1. **User provides git URL** (HTTPS or SSH)
2. **Agor suggests slug** (extracted from URL, e.g., "myapp" from "github.com/user/myapp")
3. **Clone as bare repo** to `~/.agor/repos/{slug}`
4. **Detect default branch** (usually "main" or "master")
5. **Create initial worktree** (optional, for main branch)
6. **Save to database** with repo metadata

**Example:**
```bash
$ agor repo add https://github.com/user/myapp.git

Cloning repository...
✓ Cloned to ~/.agor/repos/myapp

Suggested slug: myapp
Accept? [Y/n]: y

Default branch: main
Create worktree for main branch? [Y/n]: y

✓ Created worktree at ~/.agor/worktrees/myapp/main

Repository added:
  Slug:    myapp
  Remote:  https://github.com/user/myapp.git
  Path:    ~/.agor/repos/myapp
  Default: main
```

### Listing Repositories

**CLI:** `agor repo list`

**Output:**
```
┌──────────┬───────────────────────────────────────┬───────────┬───────┐
│ Slug     │ Remote                                │ Worktrees │ Sessions │
├──────────┼───────────────────────────────────────┼───────────┼──────────┤
│ myapp    │ github.com/user/myapp.git             │ 3         │ 5        │
│ backend  │ github.com/company/backend-api.git    │ 2         │ 3        │
│ frontend │ github.com/company/frontend.git       │ 1         │ 2        │
└──────────┴───────────────────────────────────────┴───────────┴──────────┘
```

### Showing Repository Details

**CLI:** `agor repo show <slug>`

**Output:**
```
Repository: myapp
─────────────────

Slug:            myapp
Remote:          https://github.com/user/myapp.git
Local Path:      ~/.agor/repos/myapp
Default Branch:  main
Created:         2 days ago

Worktrees (3):
┌──────────────┬────────────┬──────────────────────────────┬──────────┐
│ Name         │ Branch     │ Path                         │ Sessions │
├──────────────┼────────────┼──────────────────────────────┼──────────┤
│ main         │ main       │ ~/.agor/worktrees/myapp/main │ 2        │
│ feat-auth    │ feat-auth  │ ~/.agor/worktrees/.../feat-..│ 1        │
│ fix-cors     │ fix-cors   │ ~/.agor/worktrees/.../fix-.. │ 1        │
└──────────────┴────────────┴──────────────────────────────┴──────────┘

Sessions (5):
  01933e4a: "Add authentication middleware" (feat-auth worktree)
  01934c2d: "Fix CORS configuration" (fix-cors worktree)
  ...
```

---

## Worktree Management

### Creating a Worktree

**CLI:** `agor repo worktree add <repo-slug> <name> [--ref <branch>]`

**Flow:**
1. **Validate repo exists** and is Agor-managed
2. **Check if worktree name exists** (error if duplicate)
3. **Determine ref**:
   - If `--ref` provided: Use that branch/commit
   - If remote branch exists with same name: Offer to track it
   - Otherwise: Create new local branch
4. **Create worktree directory** at `~/.agor/worktrees/{repo-slug}/{name}`
5. **Run git worktree add**
6. **Update database** with worktree metadata

**Example 1: New branch**
```bash
$ agor repo worktree add myapp feat-auth

Creating worktree 'feat-auth' in repository 'myapp'...

Branch 'feat-auth' does not exist.
Create new branch from main? [Y/n]: y

✓ Created worktree at ~/.agor/worktrees/myapp/feat-auth
✓ Created branch feat-auth from main

Worktree ready. Start a session:
  agor session start --repo myapp --worktree feat-auth
```

**Example 2: Track remote branch**
```bash
$ agor repo worktree add myapp feat-auth

Creating worktree 'feat-auth' in repository 'myapp'...

Remote branch 'origin/feat-auth' found.
Track remote branch? [Y/n]: y

✓ Created worktree at ~/.agor/worktrees/myapp/feat-auth
✓ Tracking origin/feat-auth

Worktree ready. Start a session:
  agor session start --repo myapp --worktree feat-auth
```

### Listing Worktrees

**CLI:** `agor repo worktree list [<repo-slug>]`

**Output (all repos):**
```
Worktrees
─────────

Repository: myapp
┌──────────────┬────────────┬──────────┬────────────┐
│ Name         │ Branch     │ Sessions │ Last Used  │
├──────────────┼────────────┼──────────┼────────────┤
│ main         │ main       │ 2        │ 1 hour ago │
│ feat-auth    │ feat-auth  │ 1        │ 5 mins ago │
│ fix-cors     │ fix-cors   │ 1        │ 2 days ago │
└──────────────┴────────────┴──────────┴────────────┘

Repository: backend
┌──────────┬────────┬──────────┬────────────┐
│ Name     │ Branch │ Sessions │ Last Used  │
├──────────┼────────┼──────────┼────────────┤
│ main     │ main   │ 1        │ 1 week ago │
│ api-v2   │ api-v2 │ 2        │ 1 day ago  │
└──────────┴────────┴──────────┴────────────┘
```

### Removing a Worktree

**CLI:** `agor repo worktree remove <repo-slug> <name>`

**Flow:**
1. **Check for active sessions** using this worktree
2. **Confirm deletion** (especially if sessions exist)
3. **Run git worktree remove**
4. **Delete directory** (if git command fails)
5. **Update database** (remove worktree record, update sessions)

**Example:**
```bash
$ agor repo worktree remove myapp feat-auth

⚠ Warning: 1 active session uses this worktree:
  - 01933e4a: "Add authentication middleware"

Remove worktree and mark session as orphaned? [y/N]: y

✓ Removed worktree at ~/.agor/worktrees/myapp/feat-auth
✓ Updated session 01933e4a (marked as orphaned)

Note: Session data preserved in database.
```

### Cleanup (Prune)

**CLI:** `agor repo worktree prune [<repo-slug>]`

**Purpose:** Remove stale worktree metadata (e.g., manually deleted directories)

```bash
$ agor repo worktree prune

Scanning for stale worktrees...

Found 2 stale worktrees:
  - myapp/old-experiment (directory not found)
  - backend/temp-fix (directory not found)

Remove stale metadata? [Y/n]: y

✓ Pruned 2 stale worktrees
```

---

## Session Creation Workflows

### Workflow 1: Agor-Managed Worktree (Recommended)

**CLI:** `agor session start`

**Interactive flow:**
```bash
$ agor session start

Prompt: Add authentication middleware to API

Detect current directory...
✓ Found git repository: /Users/max/code/myapp

Repository not managed by Agor.
Would you like to use an Agor-managed worktree? [Y/n]: y

Suggested worktree name: feat-auth
Accept (or provide custom name): y

Repository slug: myapp
Add this repository to Agor? [Y/n]: y

Cloning https://github.com/user/myapp.git to ~/.agor/repos/myapp...
✓ Cloned

Creating worktree 'feat-auth'...
✓ Created at ~/.agor/worktrees/myapp/feat-auth
✓ Created branch feat-auth from main

Select agent:
  1. Claude Code
  2. Cursor
  3. Codex
Choice [1]: 1

✓ Created session 01933e4a
✓ Launching claude in ~/.agor/worktrees/myapp/feat-auth...
```

### Workflow 2: User's Existing Directory

**CLI:** `agor session start --no-worktree`

**Flow:**
```bash
$ cd /Users/max/code/myapp
$ agor session start --no-worktree

Prompt: Quick fix for CORS issue

Working directory: /Users/max/code/myapp
Use this directory? [Y/n]: y

✓ Created session 01934c2d
  Working directory: /Users/max/code/myapp (user-managed)

Select agent: ...
✓ Launching claude in /Users/max/code/myapp...
```

### Workflow 3: Reuse Existing Worktree

**CLI:** `agor session start --repo <slug> --worktree <name>`

```bash
$ agor session start --repo myapp --worktree feat-auth --prompt "Continue auth work"

Using existing worktree: ~/.agor/worktrees/myapp/feat-auth

✓ Created session 01935abc
✓ Launching claude in worktree...
```

---

## Database Schema

### Repos Table

```typescript
// Drizzle schema
export const repos = sqliteTable('repos', {
  repo_id: text('repo_id', { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  slug: text('slug', { length: 100 }).notNull().unique(),
  name: text('name', { length: 255 }).notNull(),
  remote_url: text('remote_url'),
  local_path: text('local_path', { length: 500 }).notNull(),
  managed_by_agor: integer('managed_by_agor', { mode: 'boolean' }).notNull(),
  default_branch: text('default_branch', { length: 100 }),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  last_updated: integer('last_updated', { mode: 'timestamp' }),
}, (table) => ({
  slugIdx: index('repo_slug_idx').on(table.slug),
}));

export const worktrees = sqliteTable('worktrees', {
  worktree_id: text('worktree_id', { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  repo_id: text('repo_id', { length: 36 }).notNull().references(() => repos.repo_id, { onDelete: 'cascade' }),
  name: text('name', { length: 100 }).notNull(),
  path: text('path', { length: 500 }).notNull(),
  ref: text('ref', { length: 255 }).notNull(),
  new_branch: integer('new_branch', { mode: 'boolean' }).notNull(),
  tracking_branch: text('tracking_branch', { length: 255 }),
  last_commit_sha: text('last_commit_sha', { length: 40 }),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
  last_used: integer('last_used', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  repoIdx: index('worktree_repo_idx').on(table.repo_id),
  uniqueName: unique('worktree_repo_name').on(table.repo_id, table.name),
}));
```

### Session Updates

```typescript
// Add repo context to sessions table JSON data
data: text('data', { mode: 'json' }).$type<{
  // ... existing fields
  repo: {
    repo_id?: string;
    repo_slug?: string;
    worktree_name?: string;
    cwd: string;
    managed_worktree: boolean;
  };
}>().notNull(),
```

---

## Best Practices

### When to Use Agor-Managed Worktrees

**✅ Use Agor-managed worktrees when:**
- Working on multiple features/bugs in parallel
- Experimenting with different approaches (fork sessions)
- Team members collaborate on different branches
- Running long-lived agent sessions
- Want automatic cleanup and organization

**❌ Use user directory when:**
- Quick one-off tasks in existing checkout
- Already have complex git workflow/tooling
- Need specific git hooks or local config
- Working in monorepo with sparse checkout

### Naming Conventions

**Good worktree names (slugs):**
- `feat-auth` - Feature: authentication
- `fix-cors` - Bug fix: CORS issue
- `exp-rewrite` - Experiment: rewrite approach
- `refactor-db` - Refactoring: database layer

**Avoid:**
- Spaces: `feat auth` ❌
- Special chars: `feat/auth` ❌ (use `feat-auth` ✅)
- Generic names: `test`, `temp`, `new` ❌
- Too long: `add-authentication-middleware-with-jwt-validation` ❌

### Cleanup Recommendations

**Regularly prune stale worktrees:**
```bash
# Weekly cleanup
agor repo worktree prune

# Remove completed work
agor repo worktree remove myapp feat-auth
```

**Limit active worktrees:**
- Keep < 5-10 active worktrees per repo
- Remove worktrees after merging branches
- Use `agor repo worktree list` to audit

---

## Advanced Features (Future)

### Auto-sync with Remote

```bash
# Pull latest changes in all worktrees
agor repo sync myapp
```

### Worktree Templates

```bash
# Create worktree with copied config files
agor repo worktree add myapp feat-x --template web
# Copies .env, .vscode/, .cursor/ from template
```

### Tmux Integration

```bash
# Open worktree in new tmux session
agor repo worktree open myapp feat-auth --tmux
```

### Shared Worktrees

```bash
# Multiple sessions on same worktree (different tasks)
agor session start --repo myapp --worktree main --prompt "Task 1"
agor session start --repo myapp --worktree main --prompt "Task 2"
```

---

## References

**Git Worktree Documentation:**
- Official docs: https://git-scm.com/docs/git-worktree
- Best practices: https://gist.github.com/ChristopherA/4643b2f5e024578606b9cd5d2e6815cc

**Existing Tools:**
- wtp: https://github.com/satococoa/wtp
- gwq: https://github.com/d-kuro/gwq
- git-worktree-manager: https://github.com/JoshYG-TheKey/git-worktree-manager

**Related Agor Docs:**
- `context/concepts/core.md` - Core primitives
- `context/concepts/models.md` - Data models (Repo, Session)
- `context/explorations/cli.md` - CLI commands (`agor repo`)
- `context/explorations/state-management.md` - Database schema
