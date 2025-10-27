# packages/core Test Coverage Analysis

## Executive Summary

The `packages/core` directory contains **no existing tests** but has excellent candidates for test coverage. The codebase is well-structured with clear module boundaries, pure functions, and well-defined interfaces that are ideal testing targets.

**Total files analyzed:** 70+ TypeScript modules
**Lines of code:** 1,756+ in core utilities alone
**Existing tests:** 0

## Directory Structure & Module Assessment

### 📊 Module Overview

```
packages/core/src/
├── lib/                    # HIGHEST PRIORITY (Pure functions, no dependencies)
│   ├── ids.ts             [425 lines] ⭐⭐⭐ MUST TEST
│   └── validation.ts      [28 lines]  ⭐⭐ Good candidate
│
├── git/                    # CRITICAL (Core business logic)
│   └── index.ts           [476 lines] ⭐⭐⭐ CRITICAL
│
├── config/                 # HIGH PRIORITY (Configuration management)
│   ├── config-manager.ts  [231 lines] ⭐⭐⭐ CRITICAL
│   ├── repo-reference.ts  [178 lines] ⭐⭐⭐ CRITICAL
│   ├── repo-list.ts       [174 lines] ⭐⭐ Important
│   ├── constants.ts       [109 lines] ⭐ Low risk
│   └── types.ts           [114 lines] ⭐ Type definition
│
├── db/                     # MEDIUM PRIORITY (Database layer)
│   ├── repositories/      # Well-structured CRUD implementations
│   │   ├── base.ts        ⭐⭐⭐ Test base error classes
│   │   ├── repos.ts       ⭐⭐ CRUD patterns
│   │   ├── sessions.ts    ⭐⭐ CRUD patterns
│   │   ├── worktrees.ts   ⭐⭐ CRUD patterns
│   │   ├── messages.ts    ⭐⭐ CRUD patterns
│   │   └── tasks.ts       ⭐⭐ CRUD patterns
│   └── client.ts          ⭐ Database connection
│
├── api/                    # LOW PRIORITY (Feathers client setup)
│   └── index.ts           ⭐ Configuration, not core logic
│
├── utils/                  # HIGH PRIORITY (Business logic)
│   └── pricing.ts         [129 lines] ⭐⭐⭐ Pure calculation
│
└── types/                  # NO TESTING NEEDED
    └── *.ts               # Type definitions only
```

---

## Module Analysis & Recommendations

### 🟢 HIGHEST PRIORITY: Pure Utilities & Functions

#### 1. **lib/ids.ts** [425 lines]

**Stability:** ⭐⭐⭐ Stable (5 commits in last 50)
**Risk Level:** CRITICAL
**Why Test:** Core system-wide functionality, no external dependencies, pure functions

**Functions to test:**

- `generateId()` - UUID generation
- `isValidUUID()` - UUID validation with regex
- `isValidShortID()` - Short ID format validation
- `shortId()` - UUID truncation
- `expandPrefix()` - SQL LIKE pattern generation
- `resolveShortId()` - Ambiguity resolution with custom error type
- `findMinimumPrefixLength()` - Optimal prefix length calculation
- `isUniquePrefix()` - Uniqueness checking

**Test Coverage Goals:** 100% (no external I/O)

**Example Test Cases:**

```typescript
// UUID validation
- Valid v7 UUID format
- Invalid version numbers
- Invalid variant bits
- Regex edge cases (hyphens, case-insensitivity)

// Short ID resolution (git-style)
- Exact match
- Ambiguous prefix (multiple matches)
- No matches found
- Proper error messages with suggestions

// Prefix expansion
- Partial prefixes: "01933e4a" → "01933e4a%"
- Full UUID without hyphens: conversion to formatted UUID
- Boundary conditions (8 chars, 32 chars, 12 chars)
```

---

#### 2. **utils/pricing.ts** [129 lines]

**Stability:** ⭐⭐⭐ Stable (static pricing data)
**Risk Level:** HIGH (Business critical)
**Why Test:** Cost calculation affects user experience and billing accuracy

**Functions to test:**

- `calculateTokenCost()` - Cost calculation for different agents
- `formatCost()` - Currency formatting with proper precision
- `formatTokenCount()` - Number formatting with separators

**Test Coverage Goals:** 100% (pure functions)

**Example Test Cases:**

```typescript
// Cost calculation
- Claude Code (with cache tokens)
- Gemini (cheaper pricing)
- Unknown agent (fallback behavior)
- Edge cases (0 tokens, very small amounts, large amounts)

// Formatting
- Very small costs ($0.0001)
- Normal costs ($1.23)
- Zero costs ($0.00)
- Token counts (1, 1000, 1000000)
```

---

#### 3. **lib/validation.ts** [28 lines]

**Stability:** ⭐⭐ Recent (2-3 commits)
**Risk Level:** MEDIUM
**Why Test:** File system validation, error handling

**Functions to test:**

- `validateDirectory()` - Directory existence/type checking

**Test Coverage Goals:** 100% (single function)

---

### 🟡 HIGH PRIORITY: Configuration Management

#### 4. **config/config-manager.ts** [231 lines]

**Stability:** ⭐⭐⭐ Stable (7+ commits over months)
**Risk Level:** HIGH
**Why Test:** Core system configuration, file I/O, YAML parsing

**Key functions:**

- `loadConfig()` - YAML file reading with defaults
- `saveConfig()` - YAML serialization
- `getConfigValue()` - Nested key resolution with dot notation
- `setConfigValue()` - Nested key mutation with validation
- `unsetConfigValue()` - Key deletion
- `getDaemonUrl()` - Environment variable override resolution
- `initConfig()` - Default initialization

**Test Coverage Goals:** 95%+ (I/O requires mocking/fixtures)

**Unique Challenges:**

- File I/O (requires temp directories)
- YAML parsing (edge cases)
- Deep merging with defaults
- Environment variable overrides

**Example Test Cases:**

```typescript
// File operations
- Load non-existent file (returns defaults)
- Load valid YAML
- Load invalid YAML (error handling)
- Save and reload roundtrip

// Nested key operations
- Get nested value (e.g., "daemon.port")
- Set nested value with auto-creation
- Unset nested value
- Get/set top-level keys (should error)
- Non-existent keys (undefined)

// Environment overrides
- PORT env var overrides config.daemon.port
- Invalid PORT value (parse errors)
```

---

#### 5. **config/repo-reference.ts** [178 lines]

**Stability:** ⭐⭐⭐ Stable (foundational module)
**Risk Level:** HIGH
**Why Test:** String parsing for core workflows, error handling

**Functions to test:**

- `parseRepoReference()` - Three format parsing (path, slug, slug:worktree)
- `extractSlugFromUrl()` - Git URL parsing (HTTPS, SSH, bare)
- `isValidSlug()` - Slug format validation
- `formatRepoReference()` - Slug formatting with optional worktree

**Test Coverage Goals:** 100% (pure string functions)

**Example Test Cases:**

```typescript
// Reference parsing
- Absolute paths: /Users/max/code/agor
- Windows paths: C:\Users\max\code\agor
- Managed slugs: anthropics/agor
- Managed with worktree: anthropics/agor:feat-auth
- Edge cases: colons in paths

// Git URL parsing
- HTTPS URLs: https://github.com/anthropics/agor.git
- SSH URLs: git@github.com:anthropics/agor.git
- URLs without .git suffix
- URLs with .git suffix
- Various host formats (github, gitlab, gitea, etc.)

// Slug validation
- Valid slugs: org/repo, my-org/my-repo-123
- Invalid: no slash, spaces, special chars
```

---

#### 6. **config/repo-list.ts** [174 lines]

**Stability:** ⭐⭐ Medium (utility module)
**Risk Level:** MEDIUM
**Why Test:** List parsing and filtering

---

### 🔵 MEDIUM PRIORITY: Database Layer

#### 7. **db/repositories/base.ts** [79 lines]

**Stability:** ⭐⭐⭐ Stable
**Risk Level:** MEDIUM
**Why Test:** Custom error classes, inheritance patterns

**Classes to test:**

- `RepositoryError` - Base error with cause tracking
- `EntityNotFoundError` - Specific entity errors
- `AmbiguousIdError` - ID resolution failures

**Test Coverage Goals:** 100%

---

#### 8. **db/repositories/repos.ts** [284 lines]

**Stability:** ⭐⭐⭐ Stable (evolving but patterns settled)
**Risk Level:** MEDIUM
**Why Test:** CRUD operations, short ID resolution, error handling

**Key methods:**

- `create()` - Insert with validation
- `findById()` - Query with short ID support
- `findBySlug()` - Slug lookup
- `update()` - Partial updates
- `delete()` - Cascading deletes

**Challenges:**

- Requires database (SQLite)
- Drizzle ORM integration
- Type conversions
- Error propagation

**Test Strategy:** Mock database or use in-memory SQLite

---

#### 9. **db/repositories/sessions.ts**, **worktrees.ts**, **messages.ts**, **tasks.ts**

**Stability:** ⭐⭐⭐ Stable (similar patterns)
**Risk Level:** MEDIUM

Each follows the same CRUD pattern. Can reuse test templates.

---

### 🟠 LOWER PRIORITY: API & Initialization

#### 10. **api/index.ts** [332 lines]

**Stability:** ⭐⭐ Medium (Feathers integration)
**Risk Level:** LOW
**Why:** Mostly configuration and type definitions

**Test focus:** Connection logic, error handling in `createClient()` and `isDaemonRunning()`

---

#### 11. **config/constants.ts** [109 lines]

**Stability:** ⭐⭐⭐ Very Stable
**Risk Level:** LOW
**Why:** Static constants, low change frequency

Only test if constants change frequently or affect calculations.

---

## Current Testing Setup

### Missing Infrastructure

```
NO test framework configured
NO test directory structure
NO CI/CD test hooks
NO coverage reporting setup
```

### Package.json Status

✗ No `vitest`, `jest`, or `mocha` dependencies
✓ Has `tsx` for running TypeScript directly
✗ No test scripts defined

---

## Recommended Testing Strategy

### Phase 1: Foundation (Priority Modules)

**Recommended Framework:** Vitest (fast, ESM-native, minimal config)

**Modules (in order):**

1. `lib/ids.ts` - 100% coverage (15-20 tests)
2. `config/repo-reference.ts` - 100% coverage (12-15 tests)
3. `utils/pricing.ts` - 100% coverage (10-12 tests)
4. `lib/validation.ts` - 100% coverage (4-6 tests)

**Expected effort:** 2-4 hours
**ROI:** High (covers critical utilities with zero external dependencies)

### Phase 2: Configuration (High-Risk Systems)

**Modules:** 5. `config/config-manager.ts` - 95%+ coverage (20-25 tests with mocking) 6. `config/repo-list.ts` - 90%+ coverage (10-12 tests)

**Expected effort:** 4-6 hours
**ROI:** High (core system configuration)

### Phase 3: Database Repositories (with Fixtures)

**Modules:** 7. `db/repositories/base.ts` - 100% coverage (6-8 tests) 8. `db/repositories/repos.ts` - 80%+ coverage (15-20 tests with DB fixtures) 9. Similar for `sessions.ts`, `worktrees.ts`, `messages.ts`, `tasks.ts`

**Expected effort:** 10-15 hours
**ROI:** Medium (database layer is lower risk due to ORM)

### Phase 4: API & Integration

**Modules:** 10. `api/index.ts` - 70%+ coverage (8-10 tests)

**Expected effort:** 2-3 hours
**ROI:** Low

---

## Test Configuration Boilerplate

### 1. Install Vitest

```bash
pnpm add -D vitest @vitest/ui
```

### 2. vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },
  },
});
```

### 3. Add test scripts to package.json

```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage"
  }
}
```

### 4. Test directory structure

```
packages/core/
├── src/
│   ├── lib/
│   ├── git/
│   └── ...
└── __tests__/
    ├── unit/
    │   ├── lib/
    │   │   ├── ids.test.ts
    │   │   └── validation.test.ts
    │   ├── git/
    │   │   └── index.test.ts
    │   ├── config/
    │   │   ├── config-manager.test.ts
    │   │   ├── repo-reference.test.ts
    │   │   └── repo-list.test.ts
    │   └── utils/
    │       └── pricing.test.ts
    ├── fixtures/
    │   ├── sample-uuid.ts
    │   ├── sample-config.yaml
    │   └── mock-db.ts
    └── integration/
        └── database.test.ts
```

---

## Stability Analysis: Change Frequency

### Stable (Low change rate)

- `lib/ids.ts` - 5 commits in ~50 total (stabilized UUID system)
- `utils/pricing.ts` - 1-2 commits (static data structure)
- `config/repo-reference.ts` - Foundational module, few changes
- `db/repositories/*` - Mature CRUD layer

### Medium stability (Moderate changes)

- `config/config-manager.ts` - 7 commits (core config system)
- `git/index.ts` - 15 commits (active feature development)
- `api/index.ts` - Evolving with Feathers upgrades

### High change rate

- Types - Frequent refactoring
- Tools layer - SDKs evolving

---

## Test Coverage Priorities by ROI

### Highest ROI (100% effort justified)

| Module                     | Risk     | Complexity | Effort | Value     |
| -------------------------- | -------- | ---------- | ------ | --------- |
| `lib/ids.ts`               | CRITICAL | Low        | 2h     | Very High |
| `config/repo-reference.ts` | HIGH     | Low        | 2h     | Very High |
| `utils/pricing.ts`         | HIGH     | Low        | 1.5h   | Very High |
| `lib/validation.ts`        | MEDIUM   | Trivial    | 0.5h   | High      |

**Subtotal: ~6 hours → Prevent critical bugs**

### High ROI (Worth 80%+ coverage)

| Module                     | Risk   | Complexity | Effort | Value  |
| -------------------------- | ------ | ---------- | ------ | ------ |
| `config/config-manager.ts` | HIGH   | Medium     | 4h     | High   |
| `db/repositories/base.ts`  | MEDIUM | Low        | 1h     | Medium |

**Subtotal: ~5 hours → Ensure config reliability**

### Medium ROI (70%+ coverage sufficient)

| Module                                      | Risk   | Complexity | Effort | Value      |
| ------------------------------------------- | ------ | ---------- | ------ | ---------- |
| `db/repositories/*` (repos, sessions, etc.) | MEDIUM | Medium     | 12h    | Medium     |
| `api/index.ts`                              | LOW    | Medium     | 2h     | Low-Medium |

**Subtotal: ~14 hours → Ensure data layer stability**

---

## Quick-Win Test Ideas

### Immediate Value (1-2 hours)

```typescript
// Test 1: UUID generation and validation
describe('ID Management', () => {
  it('generates valid UUIDv7', () => {
    const id = generateId();
    expect(isValidUUID(id)).toBe(true);
  });

  it('validates invalid UUIDs', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('01933e4a')).toBe(false); // short ID
  });

  it('resolves ambiguous short IDs with error', () => {
    const entities = [
      { id: '01933e4a-0000-0000-0000-000000000001' },
      { id: '01933e4a-0000-0000-0000-000000000002' },
    ];
    expect(() => resolveShortId('0193', entities)).toThrow('Ambiguous ID prefix');
  });
});

// Test 2: Repo reference parsing
describe('Repo Reference', () => {
  it('parses absolute paths', () => {
    const result = parseRepoReference('/Users/max/code/agor');
    expect(result.type).toBe('path');
    expect(result.path).toBe('/Users/max/code/agor');
  });

  it('parses managed repos with worktrees', () => {
    const result = parseRepoReference('anthropics/agor:feat-auth');
    expect(result.type).toBe('managed-worktree');
    expect(result.slug).toBe('anthropics/agor');
    expect(result.worktree).toBe('feat-auth');
  });
});

// Test 3: Pricing calculations
describe('Token Pricing', () => {
  it('calculates cost for Claude Code', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
    const cost = calculateTokenCost(usage, 'claude-code');
    expect(cost).toBe((1_000_000 / 1_000_000) * 3 + (1_000_000 / 1_000_000) * 15);
  });

  it('formats small costs with 4 decimals', () => {
    expect(formatCost(0.0001)).toBe('$0.0001');
    expect(formatCost(0.01)).toBe('$0.01');
    expect(formatCost(1.99)).toBe('$1.99');
  });
});
```

---

## Summary & Recommendations

### Top Priority Modules (Test First)

1. **lib/ids.ts** - Critical, pure, no dependencies → ~20 tests
2. **config/repo-reference.ts** - Critical, pure parsing → ~15 tests
3. **utils/pricing.ts** - Business critical, pure → ~12 tests
4. **config/config-manager.ts** - System critical, file I/O → ~25 tests

### Total Effort

- **Phase 1 (Pure utilities):** 4-6 hours
- **Phase 2 (Config):** 4-6 hours
- **Phase 3 (Database):** 10-15 hours
- **Total:** 18-27 hours for comprehensive coverage

### Expected Coverage

- Pure utility modules: 100%
- Config modules: 95%+
- Database repositories: 80-85%
- Overall: 85%+ across core package

### Immediate Next Steps

1. Install Vitest
2. Create test structure (**tests**/)
3. Start with `lib/ids.ts` (highest ROI)
4. Gradually add other modules
5. Set up CI/CD integration

---

## Files Analyzed

### Core Utilities

- ✓ packages/core/src/lib/ids.ts
- ✓ packages/core/src/lib/validation.ts
- ✓ packages/core/src/utils/pricing.ts

### Git Operations

- ✓ packages/core/src/git/index.ts

### Configuration

- ✓ packages/core/src/config/config-manager.ts
- ✓ packages/core/src/config/repo-reference.ts
- ✓ packages/core/src/config/repo-list.ts
- ✓ packages/core/src/config/constants.ts
- ✓ packages/core/src/config/types.ts

### Database

- ✓ packages/core/src/db/repositories/base.ts
- ✓ packages/core/src/db/repositories/repos.ts
- ✓ packages/core/src/db/repositories/sessions.ts
- ✓ packages/core/src/db/repositories/worktrees.ts
- ✓ packages/core/src/db/repositories/messages.ts

### API

- ✓ packages/core/src/api/index.ts

### Git History Analysis

- ✓ Recent commits affecting core modules
- ✓ Stability assessment for each module
