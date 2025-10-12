# Permission System - Implementation Status

## Current Status: **Partially Complete** ✅🔄

We've successfully completed Phases 1-3 of the backend infrastructure, but need to refactor Phase 4 (UI) to align with Agor's multi-user, task-centric architecture.

---

## ✅ Completed: Backend Infrastructure (Phases 1-3)

### Phase 1: User Settings Loading

**Status:** ✅ Complete

```typescript
// packages/core/src/tools/claude/prompt-service.ts
settingSources: ['user', 'project']; // Respects ~/.claude/settings.json
```

### Phase 2: PreToolUse Hook

**Status:** ✅ Complete

- Created `PermissionService` class (`packages/core/src/permissions/permission-service.ts`)
- Implemented PreToolUse hook in `ClaudePromptService`
- Hook pauses SDK execution until permission decision received

### Phase 3: Daemon Wiring

**Status:** ✅ Complete

- PermissionService instantiated in daemon (`apps/agor-daemon/src/index.ts`)
- WebSocket event broadcasting via `app.service('sessions').emit('permission:request')`
- Permission decision endpoint: `POST /sessions/:id/permission-decision`

---

## 🔄 In Progress: Task-Centric UI (Phase 4 Refactor)

### Architecture Decision: Permission State at Task Level

**Key Insight:** Permission requests are stored in the **Task** object, not globally.

#### Why Task-Level?

1. **Multi-user collaborative approval** - ANY user viewing the session can approve
2. **Inline conversation display** - Permission prompt renders under last message
3. **Persistent audit trail** - Task stores who approved and when
4. **Multiple simultaneous sessions** - Each task tracks its own permission state

### Updated Task Type

```typescript
// packages/core/src/types/task.ts

export type TaskStatus =
  | 'created'
  | 'running'
  | 'awaiting_permission' // NEW: Task blocked waiting for permission
  | 'completed'
  | 'failed';

export interface Task {
  // ... existing fields ...

  // NEW: Permission request (when status='awaiting_permission')
  permission_request?: {
    request_id: string;
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_use_id?: string;
    requested_at: string;
    // Audit trail: Who approved?
    approved_by?: string; // userId
    approved_at?: string;
  };
}
```

### Updated PermissionRequest Interface

```typescript
// packages/core/src/permissions/permission-service.ts

export interface PermissionRequest {
  requestId: string;
  sessionId: SessionID;
  taskId: TaskID; // NEW: Link to task
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseID?: string;
  timestamp: string;
}

export interface PermissionDecision {
  requestId: string;
  taskId: TaskID; // NEW: Task to resume
  allow: boolean;
  reason?: string;
  remember: boolean;
  scope: 'once' | 'session' | 'project';
  decidedBy: string; // NEW: userId of person who approved
}
```

---

## 🔨 TODO: Remaining Implementation

### 1. Update ClaudePromptService Hook ⏳

**File:** `packages/core/src/tools/claude/prompt-service.ts`

**Changes Needed:**

```typescript
private createPreToolUseHook(sessionId: SessionID, taskId: TaskID) {
  return async (
    input: PreToolUseHookInput,
    toolUseID: string | undefined,
    options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    // ... existing permission check logic ...

    // NEW: Update task status to 'awaiting_permission'
    await this.tasksRepo.update(taskId, {
      status: 'awaiting_permission',
      permission_request: {
        request_id: requestId,
        tool_name: input.tool_name,
        tool_input: input.tool_input as Record<string, unknown>,
        tool_use_id: toolUseID,
        requested_at: new Date().toISOString(),
      },
    });

    // Emit WebSocket event with taskId
    this.permissionService.emitRequest(sessionId, {
      requestId,
      taskId,  // NEW
      toolName: input.tool_name,
      toolInput: input.tool_input as Record<string, unknown>,
      toolUseID,
      timestamp: new Date().toISOString(),
    });

    // Wait for decision...
    const decision = await this.permissionService.waitForDecision(
      requestId,
      options.signal
    );

    // NEW: Update task with approval info
    await this.tasksRepo.update(taskId, {
      status: decision.allow ? 'running' : 'failed',
      'permission_request.approved_by': decision.decidedBy,
      'permission_request.approved_at': new Date().toISOString(),
    });

    // ... existing permission persistence logic ...
  };
}
```

### 2. Update Permission Decision Endpoint ⏳

**File:** `apps/agor-daemon/src/index.ts`

**Changes Needed:**

```typescript
// Permission decision endpoint
app.use('/sessions/:id/permission-decision', {
  async create(data: PermissionDecision, params: RouteParams) {
    const id = params.route?.id;
    if (!id) throw new Error('Session ID required');
    if (!data.requestId) throw new Error('requestId required');
    if (!data.taskId) throw new Error('taskId required'); // NEW
    if (!data.decidedBy) throw new Error('decidedBy required'); // NEW
    if (typeof data.allow !== 'boolean') throw new Error('allow field required');

    // NEW: Update task before resolving permission
    await tasksService.patch(data.taskId, {
      status: data.allow ? 'running' : 'failed',
      'permission_request.approved_by': data.decidedBy,
      'permission_request.approved_at': new Date().toISOString(),
    });

    // Resolve the pending permission request (SDK continues)
    permissionService.resolvePermission(data);

    return { success: true };
  },
});
```

### 3. Create Inline PermissionPrompt Component ⏳

**File:** `apps/agor-ui/src/components/PermissionPrompt/PermissionPrompt.tsx`

**NEW Component** (not modal, inline in conversation):

```tsx
interface PermissionPromptProps {
  task: Task; // Task with permission_request
  onDecide: (
    taskId: string,
    allow: boolean,
    remember: boolean,
    scope: 'once' | 'session' | 'project'
  ) => void;
}

export function PermissionPrompt({ task, onDecide }: PermissionPromptProps) {
  const { permission_request } = task;
  if (!permission_request) return null;

  return (
    <div
      style={{
        background: '#2a2a2a',
        border: '1px solid #faad14',
        borderRadius: 8,
        padding: 16,
        margin: '16px 0',
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Header */}
        <div>
          <Badge status="warning" text="Awaiting Permission" />
          <Title level={5} style={{ margin: '8px 0 0 0' }}>
            {permission_request.tool_name}
          </Title>
        </div>

        {/* Tool input */}
        <div
          style={{
            background: '#1e1e1e',
            padding: 12,
            borderRadius: 4,
            maxHeight: 200,
            overflow: 'auto',
          }}
        >
          <pre style={{ margin: 0, fontSize: 12 }}>
            {JSON.stringify(permission_request.tool_input, null, 2)}
          </pre>
        </div>

        {/* Action buttons */}
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button danger onClick={() => onDecide(task.task_id, false, false, 'once')}>
            Deny
          </Button>
          <Button onClick={() => onDecide(task.task_id, true, true, 'session')}>
            Allow for Session
          </Button>
          <Button onClick={() => onDecide(task.task_id, true, true, 'project')}>
            Allow for Project
          </Button>
          <Button type="primary" onClick={() => onDecide(task.task_id, true, false, 'once')}>
            Allow Once
          </Button>
        </Space>
      </Space>
    </div>
  );
}
```

### 4. Update SessionDrawer to Render PermissionPrompt ⏳

**File:** `apps/agor-ui/src/components/SessionDrawer/SessionDrawer.tsx`

**Changes Needed:**

```tsx
// In message list rendering, after last message of each task:
{
  tasks.map(task => (
    <div key={task.task_id}>
      {/* Existing messages for this task */}
      {messages
        .filter(m => m.task_id === task.task_id)
        .map(message => (
          <MessageCard key={message.message_id} message={message} />
        ))}

      {/* NEW: Permission prompt if task awaiting permission */}
      {task.status === 'awaiting_permission' && task.permission_request && (
        <PermissionPrompt task={task} onDecide={handlePermissionDecision} />
      )}
    </div>
  ));
}
```

### 5. Update useAgorData Hook ⏳

**File:** `apps/agor-ui/src/hooks/useAgorData.ts`

**Changes Needed:**

```tsx
// Listen for permission:request events to trigger task refetch
useEffect(() => {
  if (!client) return;

  const handlePermissionRequest = (request: PermissionRequest) => {
    // Task was updated with permission_request, refetch tasks
    refetchTasks();
  };

  client.service('sessions').on('permission:request', handlePermissionRequest);

  return () => {
    client.service('sessions').off('permission:request', handlePermissionRequest);
  };
}, [client]);
```

### 6. Create handlePermissionDecision Handler ⏳

**File:** `apps/agor-ui/src/App.tsx`

**NEW Handler:**

```tsx
const handlePermissionDecision = async (
  taskId: string,
  allow: boolean,
  remember: boolean,
  scope: 'once' | 'session' | 'project'
) => {
  if (!client || !user) return;

  try {
    const task = tasks.find(t => t.task_id === taskId);
    if (!task || !task.permission_request) return;

    const decision: PermissionDecision = {
      requestId: task.permission_request.request_id,
      taskId,
      allow,
      remember,
      scope,
      decidedBy: user.user_id,
    };

    await fetch(`http://localhost:3030/sessions/${task.session_id}/permission-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(decision),
    });

    message.success(allow ? 'Permission granted!' : 'Permission denied');
  } catch (error) {
    message.error(`Failed to process permission: ${error}`);
  }
};
```

---

## Testing Checklist

### Single User Flow

- [ ] User sends prompt that triggers tool use
- [ ] Task status becomes 'awaiting_permission'
- [ ] Permission prompt appears inline under last message
- [ ] Click "Allow Once" → task resumes, status='running'
- [ ] Click "Deny" → task fails, status='failed'

### Multi-User Flow

- [ ] User A triggers tool use in shared session
- [ ] User B sees permission prompt appear in real-time
- [ ] User B clicks "Allow" → both users see task resume
- [ ] Audit trail: `task.permission_request.approved_by` = User B's ID

### Permission Persistence

- [ ] Click "Allow for Session" → session.data.permission_config updated
- [ ] Click "Allow for Project" → .claude/settings.json updated
- [ ] Future tool uses auto-approved based on saved permissions

---

## Key Architectural Benefits

✅ **Multi-user collaborative** - ANY user can approve permissions
✅ **Inline contextual UI** - Permission prompt right in conversation flow
✅ **Task-centric state** - Permission status stored with the task
✅ **Audit trail** - Track who approved what and when
✅ **Real-time sync** - WebSocket broadcasts to all viewers
✅ **No race conditions** - Task object is single source of truth

---

## Next Steps

1. Update `ClaudePromptService.createPreToolUseHook()` to accept `taskId`
2. Update permission decision endpoint to patch task
3. Create `PermissionPrompt` inline component
4. Wire into `SessionDrawer` conversation view
5. Test multi-user approval flow

---

**Status:** Backend complete, UI refactor in progress
**Owner:** Claude Code session
**Last Updated:** 2025-10-11
