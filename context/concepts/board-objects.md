# Board Objects - Parent-Child Locking (Session Pinning)

**Status:** 🚧 Not Implemented
**Related:** [models.md](./models.md), [architecture.md](./architecture.md), [design.md](./design.md), [frontend-guidelines.md](./frontend-guidelines.md)

---

## Overview

This document describes the **parent-child locking** feature for board objects, which allows sessions to be pinned to zones so they move together as a group.

### What's Already Implemented ✅

Board objects foundation is complete:

- **Zone Rectangles** - Resizable colored regions (`ZoneNode` component in `apps/agor-ui/src/components/SessionCanvas/canvas/BoardObjectNodes.tsx`)
- **Real-time Sync** - WebSocket broadcasting via daemon service hooks (`apps/agor-daemon/src/index.ts:310-344`)
- **Atomic Updates** - Backend methods (`upsertBoardObject`, `removeBoardObject`, `batchUpsertBoardObjects` in `packages/core/src/db/repositories/boards.ts`)
- **Drag-to-draw zones** - Tool in SessionCanvas with keyboard shortcuts (Z, E, Esc, Delete)
- **Storage** - `board.objects` JSON dictionary in database, `board.layout` for session positions

### What's Missing ❌

**Parent-child locking** - Sessions cannot yet be pinned to zones. When you drag a zone, sessions inside it don't move with it.

---

## Goal: Pin Sessions to Zones

Allow sessions to be pinned to zones so they move together as a group. React Flow provides native support via the `parentId` property.

### How It Works (React Flow Built-in Feature)

```typescript
// Session pinned to zone
const node = {
  id: sessionId,
  type: 'sessionNode',
  position: { x: 100, y: 100 },  // Position RELATIVE to parent zone
  parentId: 'zone-123',           // Pinned to this zone
  extent: 'parent',                // Optional: can't drag outside zone bounds
  data: { ... },
};
```

**Key behaviors:**

- When zone moves, all pinned sessions move automatically (React Flow handles this)
- Sessions maintain their relative position within the zone
- `extent: "parent"` constrains sessions to stay within zone bounds (optional)
- `expandParent: true` makes zone grow if session dragged to edge (optional)

**Coordinate system:**

- **Unpinned sessions**: Use absolute canvas coordinates
- **Pinned sessions**: Use coordinates relative to zone's top-left corner
- **Conversion required**: When pinning/unpinning, convert between absolute ↔ relative

---

## User Interface Design

### Drop Detection (Automatic Pinning)

When a session is dropped into a zone:

1. In `handleNodeDragStop` (SessionCanvas.tsx), check if session overlaps with zone using `reactFlowInstance.getIntersectingNodes()`
2. If session center is inside zone bounds, automatically set `parentId`
3. Show visual feedback (pin icon appears in session card header)
4. Convert absolute position → relative position

### Pin Icon Toggle

**Location:** Session card header (replaces drag handle when pinned)

**Icon:** `PushpinOutlined` / `PushpinFilled` from `@ant-design/icons`

**Behavior:**

- When **unpinned**: Show drag handle button as normal
- When **pinned**: Replace drag handle with pin icon (filled)
- Click pin icon → unpins session (removes `parentId`, converts position back to absolute coordinates)

**Tooltip:** "Pinned to {zone.label}" (or "Unpin from zone" on hover)

**Session Card Changes:**

```typescript
// In SessionCard component (apps/agor-ui/src/components/SessionCard/SessionCard.tsx)
{isPinned ? (
  <Button
    type="text"
    size="small"
    icon={<PushpinFilled />}
    onClick={handleUnpin}
    title={`Pinned to ${zoneName} (click to unpin)`}
  />
) : (
  <Button
    type="text"
    size="small"
    icon={<DragOutlined />}
    className="drag-handle"
    title="Drag to move"
  />
)}
```

---

## Data Storage

Extend `board.layout` to store `parentId`:

```typescript
// In packages/core/src/types/board.ts
layout?: {
  [sessionId: string]: {
    x: number;        // Absolute coordinates when unpinned, relative when pinned
    y: number;
    parentId?: string;  // Zone ID if pinned, undefined if unpinned
  }
}
```

**No schema migration needed** - `layout` is already a JSON blob in `boards.data`.

---

## Implementation Guide

### 1. Pinning Logic (SessionCanvas.tsx)

**File:** `apps/agor-ui/src/components/SessionCanvas/SessionCanvas.tsx`

**Where:** Modify existing `handleNodeDragStop` callback (currently at line ~431)

```typescript
const handleNodeDragStop: NodeDragHandler = useCallback(
  async (_event, node) => {
    if (!board || !client) return;

    // EXISTING CODE: Track final position locally
    localPositionsRef.current[node.id] = {
      x: node.position.x,
      y: node.position.y,
    };

    // NEW: Handle session pinning/unpinning
    if (node.type === 'sessionNode') {
      // Check if session dropped inside a zone
      const intersections = reactFlowInstanceRef.current?.getIntersectingNodes(node) || [];
      const zone = intersections.find(n => n.type === 'zone');

      const currentParentId = board.layout?.[node.id]?.parentId;

      if (zone && !currentParentId) {
        // Pin to zone: convert absolute position to relative
        const relativeX = node.position.x - zone.position.x;
        const relativeY = node.position.y - zone.position.y;

        await client.service('boards').patch(board.board_id, {
          layout: {
            ...board.layout,
            [node.id]: { x: relativeX, y: relativeY, parentId: zone.id },
          },
        });

        console.log(`✓ Pinned session ${node.id} to zone ${zone.id}`);
        return; // Early return - position already saved
      } else if (!zone && currentParentId) {
        // Dragged outside zone: auto-unpin and convert to absolute position
        const parentZone = nodes.find(n => n.id === currentParentId);
        const absoluteX = parentZone ? node.position.x + parentZone.position.x : node.position.x;
        const absoluteY = parentZone ? node.position.y + parentZone.position.y : node.position.y;

        await client.service('boards').patch(board.board_id, {
          layout: {
            ...board.layout,
            [node.id]: { x: absoluteX, y: absoluteY, parentId: undefined },
          },
        });

        console.log(`✓ Unpinned session ${node.id}`);
        return; // Early return - position already saved
      }
    }

    // EXISTING CODE: Accumulate position updates for debounced persistence
    pendingLayoutUpdatesRef.current[node.id] = {
      x: node.position.x,
      y: node.position.y,
    };

    // ... rest of existing debouncing logic ...
  },
  [board, client, nodes, batchUpdateObjectPositions]
);
```

### 2. Node Construction with parentId

**File:** `apps/agor-ui/src/components/SessionCanvas/SessionCanvas.tsx`

**Where:** Modify `initialNodes` useMemo (currently at line ~138)

```typescript
const initialNodes: Node[] = useMemo(() => {
  // ... existing auto-layout logic ...

  // Convert to React Flow nodes
  return sessions.map(session => {
    const storedPosition = board?.layout?.[session.session_id];
    const autoPosition = nodeMap.get(session.session_id) || { x: 0, y: 0 };
    const position = storedPosition || autoPosition;

    // NEW: Extract parentId and zone name
    const parentId = storedPosition?.parentId;
    const zoneName = parentId ? board?.objects?.[parentId]?.label : undefined;

    return {
      id: session.session_id,
      type: 'sessionNode',
      position,
      parentId, // NEW: Set parent if pinned
      extent: parentId ? 'parent' : undefined, // NEW: Optional - constrain to zone
      draggable: true,
      data: {
        session,
        tasks: tasks[session.session_id] || [],
        users,
        currentUserId,
        onTaskClick,
        onSessionClick: () => onSessionClick?.(session.session_id),
        onDelete: onSessionDelete,
        onOpenSettings,
        compact: false,
        // NEW: Pass pinning state to SessionCard
        isPinned: !!parentId,
        zoneName,
        onUnpin: () => handleUnpin(session.session_id), // NEW: Unpin callback
      },
    };
  });
}, [
  board?.layout,
  board?.objects,
  sessions,
  tasks,
  users,
  currentUserId,
  onSessionClick,
  onTaskClick,
  onSessionDelete,
  onOpenSettings,
]);
```

### 3. Unpin Handler

**File:** `apps/agor-ui/src/components/SessionCanvas/SessionCanvas.tsx`

**Where:** Add new callback near other handlers

```typescript
// NEW: Unpin handler (called when user clicks pin icon in SessionCard)
const handleUnpin = useCallback(
  async (sessionId: string) => {
    if (!board || !client) return;

    const node = nodes.find(n => n.id === sessionId);
    const layout = board.layout?.[sessionId];
    if (!node || !layout?.parentId) return;

    // Convert relative position to absolute
    const parentZone = nodes.find(n => n.id === layout.parentId);
    const absoluteX = parentZone ? node.position.x + parentZone.position.x : node.position.x;
    const absoluteY = parentZone ? node.position.y + parentZone.position.y : node.position.y;

    await client.service('boards').patch(board.board_id, {
      layout: {
        ...board.layout,
        [sessionId]: { x: absoluteX, y: absoluteY, parentId: undefined },
      },
    });

    console.log(`✓ Unpinned session ${sessionId}`);
  },
  [nodes, board, client]
);
```

### 4. SessionCard Pin Icon

**File:** `apps/agor-ui/src/components/SessionCard/SessionCard.tsx`

**Where:** Modify the drag handle section in the card header

**Current code** (approximately line ~60-70):

```typescript
<Button
  type="text"
  size="small"
  icon={<DragOutlined />}
  className="drag-handle"
  title="Drag to move"
/>
```

**Replace with:**

```typescript
{isPinned ? (
  <Button
    type="text"
    size="small"
    icon={<PushpinFilled />}
    onClick={(e) => {
      e.stopPropagation(); // Prevent drawer from opening
      onUnpin?.();
    }}
    title={`Pinned to ${zoneName} (click to unpin)`}
    style={{ color: token.colorPrimary }}
  />
) : (
  <Button
    type="text"
    size="small"
    icon={<DragOutlined />}
    className="drag-handle"
    title="Drag to move"
  />
)}
```

**Add to SessionCard props:**

```typescript
interface SessionCardProps {
  // ... existing props ...
  isPinned?: boolean;
  zoneName?: string;
  onUnpin?: () => void;
}
```

**Import:**

```typescript
import { PushpinFilled, DragOutlined } from '@ant-design/icons';
```

---

## Visual Feedback

**Pinned sessions:**

- Show `PushpinFilled` icon instead of drag handle
- Icon color: `token.colorPrimary` (blue)
- Tooltip shows zone name

**Optional enhancements:**

- Add subtle border color change when pinned
- Show zone label in session card subtitle
- Animate pin/unpin transition

---

## Testing Checklist

1. **Drop session into zone** → Should auto-pin with pin icon visible
2. **Drag pinned zone** → Pinned sessions move with it (relative positions preserved)
3. **Click pin icon** → Session unpins, icon changes back to drag handle
4. **Drag pinned session outside zone** → Auto-unpins (optional behavior)
5. **Reload page** → Pinned state persists (from database)
6. **Multi-user sync** → Other users see pinned sessions move with zone in real-time

---

## Edge Cases

1. **Zone deleted while sessions pinned** → Need to auto-unpin orphaned sessions (add logic to zone delete handler)
2. **Session moved to different board** → Clear `parentId` from old board layout
3. **Zone resized with pinned sessions** → Sessions maintain relative positions (React Flow handles this)
4. **Pinned session dragged slightly** → Should stay pinned (only unpin if dragged outside zone bounds)

---

## Effort Estimate

**Total: ~2-3 hours**

- Drop detection logic: 30 min
- Coordinate conversion (relative ↔ absolute): 45 min
- Pin icon UI in SessionCard: 30 min
- Unpin handler + data flow: 30 min
- Testing & edge cases: 45 min

---

## Future: Prompt Triggers (Kanban Automation)

**Note:** This is a SEPARATE feature, not part of parent-child locking.

**Goal:** Trigger actions when a session is dropped into a zone (e.g., change status, spawn subtask, send prompt).

**Use Cases:**

- Status zones (Backlog → In Progress → Review → Complete)
- Automated prompts (drop into "Code Review" zone spawns review task)
- Kanban workflows with automatic state management

**Implementation:** Extend `ZoneBoardObject` with `trigger` field:

```typescript
interface ZoneBoardObject {
  type: 'zone';
  // ... existing fields ...

  trigger?: {
    action: 'prompt' | 'fork' | 'spawn' | 'status';
    prompt?: string;
    status?: 'idle' | 'running' | 'completed' | 'failed';
    promptTemplate?: string;
  };
}
```

**UI:** Add settings button in zone toolbar (already exists) that opens configuration modal (already exists as placeholder in `ZoneConfigModal.tsx`).

**Effort:** ~3-4 hours (separate from pinning feature)

---

## References

- **React Flow Parent-Child Nodes:** https://reactflow.dev/examples/nodes/sub-flows
- **React Flow Collision Detection:** https://reactflow.dev/examples/interaction/collision-detection
- **Current Implementation:**
  - Zone node: `apps/agor-ui/src/components/SessionCanvas/canvas/BoardObjectNodes.tsx`
  - Session canvas: `apps/agor-ui/src/components/SessionCanvas/SessionCanvas.tsx`
  - Board repository: `packages/core/src/db/repositories/boards.ts`
  - Daemon hooks: `apps/agor-daemon/src/index.ts:310-344`
