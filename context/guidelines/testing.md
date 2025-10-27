# Testing Guidelines

**Vitest with co-located test files.**

---

## Core Rule

**Place `{file}.test.ts` as sibling to source file:**

```
✅ packages/core/src/lib/ids.ts
✅ packages/core/src/lib/ids.test.ts

❌ packages/core/src/__tests__/lib/ids.test.ts
```

---

## Priority Order

Test stable code first:

1. **Core utilities** (`lib/ids.ts`, `utils/pricing.ts`) → 100% coverage target
2. **Config/Git** (`config-manager.ts`, `git/index.ts`) → 90-95%
3. **Database repos** → 85%
4. **Services** → 80%
5. **React components** → 70%

---

## Quick Examples

**Pure function:**

```typescript
// lib/ids.test.ts
import { generateId } from './ids';

describe('generateId', () => {
  it('should generate unique UUIDs', () => {
    expect(generateId()).not.toBe(generateId());
  });
});
```

**React component (use RTL):**

```typescript
// components/TaskListItem.test.tsx
import { render, screen } from '@testing-library/react';
import { TaskListItem } from './TaskListItem';

it('should render task content', () => {
  render(<TaskListItem task={{ id: '1', content: 'Test' }} />);
  expect(screen.getByText('Test')).toBeInTheDocument();
});
```

**Database repo (in-memory SQLite):**

```typescript
// db/repositories/repos.test.ts
let db = createClient(':memory:');
await migrate(db);
const repo = new RepoRepository(db);
```

---

## Run Tests

```bash
pnpm test              # Run all
pnpm test:watch        # Watch mode
pnpm test -- --coverage
```
