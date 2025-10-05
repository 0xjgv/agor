# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agor** is an agent orchestration platform for AI-assisted development. It provides a unified interface to coordinate multiple AI coding agents (Claude Code, Cursor, Codex, Gemini), visualize session trees, and capture knowledge automatically.

**Current Status:** UI prototype phase using React + TypeScript + Ant Design + Storybook

**Key Insight:** Context engineering is about managing sessions, tasks, and concepts as first-class composable primitives stored in a session tree.

## Project Structure

```
agor/
├── agor-ui/              # React UI prototype (current focus)
│   ├── src/
│   │   ├── types/        # TypeScript types (Session, Task, Board, Agent, Concept)
│   │   ├── components/   # React components with .stories.tsx files
│   │   ├── mocks/        # Mock data for development
│   │   └── App.tsx       # Main orchestration component
│   ├── .storybook/       # Storybook configuration
│   └── package.json
│
├── context/              # Modular knowledge files (architecture docs)
│   ├── concepts/         # Core design docs (core, models, architecture, design)
│   └── explorations/     # WIP experimental designs
│
├── README.md            # Product vision and overview
└── PROJECT.md           # UI prototype roadmap and implementation status
```

## Development Commands

All commands must be run from the `agor-ui/` directory:

```bash
# Component development (primary workflow)
cd agor-ui
npm run storybook        # Start Storybook on :6006

# Application development
npm run dev              # Start Vite dev server

# Quality checks
npm run typecheck        # TypeScript type checking (no emit)
npm run lint             # ESLint
npm run test             # Run Vitest in watch mode
npm run test:run         # Run tests once
npm run test:ui          # Vitest UI

# Production builds
npm run build            # TypeScript compile + Vite build
npm run build-storybook  # Build static Storybook
```

## Architecture Fundamentals

### Five Core Primitives

1. **Session** - Container for all agent interactions. Has genealogy (fork/spawn), git state, concepts, tasks
2. **Task** - User prompts as first-class work units. Tracks git state, tool usage, message ranges
3. **Report** - Post-task structured learnings (auto-generated)
4. **Worktree** - Git worktrees for session isolation
5. **Concept** - Modular context files that compose into session-specific knowledge

See `context/concepts/core.md` for detailed explanations.

### Data Models

All TypeScript interfaces live in `agor-ui/src/types/`:
- `Session` - session.ts (status, agent, git_state, genealogy, concepts, tasks)
- `Task` - task.ts (description, status, message_range, git_state, tool_use_count)
- `Board` - board.ts (organize sessions into boards like Trello)
- `Agent` - agent.ts (Claude Code, Cursor, Codex, Gemini with install state)
- `Concept` - concept.ts (modular context nuggets)

See `context/concepts/models.md` for canonical data model definitions.

### Session Tree & Genealogy

- **Fork** - Branching at a decision point (creates sibling session)
- **Spawn** - Delegating a subtask (creates child session)
- Sessions track parent/child relationships in `genealogy` field
- Visualized as React Flow canvas with edges showing fork (dashed) vs spawn (solid)

## UI Component Architecture

### Tech Stack
- **Vite + React 19 + TypeScript** - Fast iteration, no SSR overhead
- **Ant Design** - Primary component library (dark mode by default)
- **@ant-design/x** - Chat/session components + React Flow for canvas
- **Storybook** - Component development (Storybook-first workflow)
- **Vitest + RTL** - Testing

### Component Patterns

**Atomic Design:**
- Atoms: Ant Design primitives (Button, Input, Tag, Badge)
- Molecules: TaskListItem, AgentSelectionCard, NewSessionButton
- Organisms: SessionCard, SessionDrawer, SessionListDrawer, SessionCanvas
- Templates: App layout (header + canvas + two-drawer overlay)

**File Structure per Component:**
```
ComponentName/
├── ComponentName.tsx          # Implementation
├── ComponentName.stories.tsx  # Storybook stories (3-5+ required)
└── index.ts                   # Export
```

**Key Components:**
- `SessionCard` - Expandable card showing session with task list (latest 5 tasks)
- `SessionDrawer` - Right drawer with full task timeline + input box
- `SessionListDrawer` - Left drawer for browsing sessions by board
- `SessionCanvas` - React Flow infinite canvas with snap-to-grid (20x20px)
- `TaskListItem` - Compact task row with smart truncation (120 chars)
- `NewSessionModal` - Agent selection + prompt input

### UI Standards (Critical)

**Theming:**
- Dark mode by default (`theme.darkAlgorithm`)
- **STRICT Ant Design token usage** - No custom CSS
  - Use `token.colorBgContainer`, `token.colorBorder`, `token.borderRadiusLG`, etc.
  - Never write custom CSS files unless absolutely necessary

**Icons:**
- Use Ant Design icons ONLY (no emojis in components)
- Standard mappings:
  - `MessageOutlined` - Message count
  - `ToolOutlined` - Tool usage
  - `LoadingOutlined` with `Spin` - Running states
  - `EditOutlined` - Git dirty state
  - `GithubOutlined` - Git state

**Status Colors:**
- Running: `processing` (blue)
- Completed: `success` (green)
- Failed: `error` (red)
- Idle: `default` (gray)

**Two-Drawer Overlay Pattern:**
- Left drawer: Session list browser (triggered by header menu/board name)
- Right drawer: Session detail (triggered by clicking session cards)
- Both can be open simultaneously

See `context/concepts/design.md` for complete design standards.

## Development Workflow

### Component Development (Primary)
1. Use Storybook-first approach: `npm run storybook`
2. Create component in `src/components/ComponentName/`
3. Add TypeScript props interface
4. Create 3-5+ Storybook stories
5. Use mock data from `src/mocks/`
6. Follow Ant Design token standards

### Adding Components
- Always read existing similar components first
- Use Edit tool to modify existing files (preferred over Write)
- Import types from `src/types/`
- Use mocks from `src/mocks/`

### Mock Data
Located in `agor-ui/src/mocks/`:
- `sessions.ts` - 18+ realistic sessions with genealogy
- `tasks.ts` - Tasks with conversational user prompts
- `boards.ts` - Default Board, Experiments, Bug Fixes
- `agents.ts` - claude-code, codex (installed), cursor, gemini (not installed)
- `concepts.ts` - Concept tags (auth, security, database, etc.)

## Git Integration

Sessions track git state with three key fields:
- `git_state.ref` - Branch/tag name
- `git_state.base_sha` - Starting commit
- `git_state.current_sha` - Current commit (can be `{sha}-dirty` for uncommitted changes)

Tasks also track:
- `git_state.sha_at_start` - Commit when task started
- `git_state.sha_at_end` - Commit when task completed (optional)
- `git_state.commit_message` - Associated commit message

## Context Files

The `context/` directory contains architectural documentation:

**Core Concepts** (read these first):
- `concepts/core.md` - 5 primitives, vision, core insights
- `concepts/models.md` - Data models and relationships
- `concepts/architecture.md` - System design and storage structure
- `concepts/design.md` - UI/UX standards and component patterns

**Explorations** (WIP designs):
- `explorations/state-management.md` - Drizzle + LibSQL persistence
- `explorations/agent-interface.md` - Agent abstraction layer
- `explorations/state-broadcasting.md` - Real-time sync architecture

These files are designed to be loaded as context for AI agents.

## Implementation Status

**Phase 1 (Complete):**
- TypeScript types for all primitives
- SessionCard, SessionDrawer, SessionCanvas, TaskListItem
- Board system with filtering
- Two-drawer overlay pattern
- NewSessionModal with agent selection
- Mock data with 18+ realistic sessions
- Storybook stories for all components

**Phase 2 (In Progress):**
- Task detail expansion in drawer
- Report preview UI
- Session filtering/search
- Multi-session operations

See `PROJECT.md` for detailed roadmap.

## Philosophy & Constraints

- **Storybook-first:** Develop components in isolation before integration
- **Type-driven:** All components receive strongly-typed props
- **Ant Design strict:** Never deviate from Ant Design tokens/components
- **Read before edit:** Always read files before editing (tool requirement)
- **Prefer Edit over Write:** Edit existing files rather than creating new ones
- **No custom CSS:** Use Ant Design components and tokens exclusively
- **Dark mode default:** All UIs designed for dark theme first

## Future Direction

**V1 (Target Q2 2025):** Desktop GUI (Electron/Tauri) with local-only orchestration
**V2 (Target Q4 2025):** Agor Cloud with real-time multiplayer collaboration

Current focus: Complete UI prototype components to inform backend implementation.
