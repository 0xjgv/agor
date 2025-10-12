# Permission System for Agor

## Overview

This document explores how to implement a permission/approval system in Agor that recreates the Claude Code CLI experience using the Claude Agent SDK's hook system.

**Key Insight:** The SDK already has a complete permission system built-in. We can piggyback on it using `settingSources` and `PreToolUse` hooks.

## SDK Permission System (Built-in)

### Settings Files

The Agent SDK reads permissions from Claude Code's standard config files:

1. **User settings:** `~/.claude/settings.json` (global, shared across all projects)
2. **Project settings:** `{cwd}/.claude/settings.json` (shared with team, checked into repo)
3. **Local settings:** `{cwd}/.claude/settings.local.json` (personal, gitignored)

**Load settings with:**

```typescript
settingSources: ['user', 'project', 'local']; // Precedence: local > project > user
```

**Settings format:**

```json
{
  "permissions": {
    "allow": {
      "tools": ["Read", "Glob", "Grep"],
      "bash_commands": ["ls", "pwd", "git status"]
    },
    "deny": ["WebFetch", "Bash(rm -rf:*)"],
    "ask": ["Bash(git push:*)", "Write(./production/**)"]
  }
}
```

### PreToolUse Hook

The SDK provides a hook that fires **before** Claude uses a tool (before any "no permission" message):

```typescript
type PreToolUseHookInput = BaseHookInput & {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: ToolInput;
};

type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

**Hook Output:**

```typescript
hookSpecificOutput: {
  hookEventName: 'PreToolUse';
  permissionDecision?: 'allow' | 'deny' | 'ask';
  permissionDecisionReason?: string;
}
```

**Critical:** Hook can return a Promise that pauses execution until resolved. This enables async permission requests to the UI!

### Permission Evaluation Order

1. **PreToolUse Hook** (Agor's custom logic)
2. **Deny rules** (from settings.json)
3. **Allow rules** (from settings.json)
4. **Ask rules** (prompts user in CLI or via hook)
5. **Permission mode** (auto-accept or normal)

### Available Hook Types

- `PreToolUse` - Before tool execution (for permission checks)
- `PostToolUse` - After tool execution
- `UserPromptSubmit` - When user sends prompt
- `SessionStart` / `SessionEnd` - Session lifecycle
- `Notification` - For progress updates
- `Stop` / `SubagentStop` - Interruption handling
- `PreCompact` - Before context compaction

## Agor Implementation Strategy

### Design Decision: Permission Scopes

**Agor supports TWO permission scopes:**

1. **Session scope** - Stored in Agor database (`session.data.permission_config`)
   - Use case: Temporary/experimental sessions with relaxed permissions
   - Lifetime: Session-specific, doesn't affect other sessions

2. **Project scope** - Written to `{cwd}/.claude/settings.json`
   - Use case: Shared team settings (checked into git)
   - Lifetime: Persistent across all sessions in this project

**We DON'T touch global scope** (`~/.claude/settings.json`) - that's Claude CLI's territory.

### Phase 1: Quick Win (5 minutes)

**Enable user settings loading:**

```typescript
// packages/core/src/tools/claude/prompt-service.ts
settingSources: ['user', 'project']; // Was: ['project']
```

**Result:** Agor immediately respects user's existing Claude Code permissions. Zero additional code needed.

**Limitation:** Permissions prompts happen in terminal (daemon stdout), not in UI.

### Phase 2: UI Permission Modal (Recommended)

#### 1. Add PreToolUse Hook to ClaudePromptService

**File:** `packages/core/src/tools/claude/prompt-service.ts`

```typescript
private async setupQuery(sessionId: SessionID, prompt: string, resume = true) {
  // ... existing setup ...

  const options: Record<string, unknown> = {
    cwd: session.repo.cwd,
    settingSources: ['user', 'project'],  // Load existing permissions
    hooks: {
      PreToolUse: this.createPreToolUseHook(sessionId)  // Add custom hook
    },
  };

  return query({ prompt, options });
}

private createPreToolUseHook(sessionId: SessionID) {
  return async (
    input: PreToolUseHookInput,
    toolUseID: string | undefined,
    options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> => {
    // Check session-specific overrides first
    const session = await this.sessionsRepo.findById(sessionId);
    if (session.data?.permission_config?.allowedTools?.includes(input.tool_name)) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason: 'Allowed by session config'
        }
      };
    }

    // Emit WebSocket event for UI
    const requestId = generateId();
    this.permissionService.emitRequest(sessionId, {
      requestId,
      toolName: input.tool_name,
      toolInput: input.tool_input,
      toolUseID,
      timestamp: new Date().toISOString()
    });

    // Wait for UI decision (Promise pauses SDK execution)
    const decision = await this.permissionService.waitForDecision(
      requestId,
      options.signal  // Respects cancellation
    );

    // Persist decision if user clicked "Remember"
    if (decision.remember) {
      if (decision.scope === 'session') {
        await this.sessionsRepo.update(sessionId, {
          'data.permission_config.allowedTools': [
            ...(session.data?.permission_config?.allowedTools || []),
            input.tool_name
          ]
        });
      } else if (decision.scope === 'project') {
        await this.updateProjectSettings(session.repo.cwd, {
          allowTools: [input.tool_name]
        });
      }
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision.allow ? 'allow' : 'deny',
        permissionDecisionReason: decision.reason
      }
    };
  };
}

private async updateProjectSettings(cwd: string, changes: {
  allowTools?: string[];
  denyTools?: string[];
}) {
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));

  if (!settings.permissions) settings.permissions = { allow: { tools: [] } };
  if (changes.allowTools) {
    settings.permissions.allow.tools = [
      ...new Set([...settings.permissions.allow.tools, ...changes.allowTools])
    ];
  }

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}
```

#### 2. Create Permission Service

**File:** `packages/core/src/permissions/permission-service.ts`

```typescript
export interface PermissionRequest {
  requestId: string;
  sessionId: SessionID;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseID?: string;
  timestamp: string;
}

export interface PermissionDecision {
  requestId: string;
  allow: boolean;
  reason?: string;
  remember: boolean;
  scope: 'once' | 'session' | 'project'; // 'once' = don't save, 'session' = db, 'project' = .claude/settings.json
}

export class PermissionService {
  private pendingRequests = new Map<
    string,
    {
      resolve: (decision: PermissionDecision) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(private emitEvent: (event: string, data: unknown) => void) {}

  emitRequest(sessionId: SessionID, request: Omit<PermissionRequest, 'sessionId'>) {
    const fullRequest: PermissionRequest = { ...request, sessionId };
    this.emitEvent('permission:request', fullRequest);
  }

  waitForDecision(requestId: string, signal: AbortSignal): Promise<PermissionDecision> {
    return new Promise(resolve => {
      // Handle cancellation
      signal.addEventListener('abort', () => {
        this.pendingRequests.delete(requestId);
        resolve({
          requestId,
          allow: false,
          reason: 'Cancelled',
          remember: false,
          scope: 'once',
        });
      });

      // Timeout after 60 seconds (fail-safe)
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          requestId,
          allow: false,
          reason: 'Timeout',
          remember: false,
          scope: 'once',
        });
      }, 60000);

      this.pendingRequests.set(requestId, { resolve, timeout });
    });
  }

  resolvePermission(decision: PermissionDecision) {
    const pending = this.pendingRequests.get(decision.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(decision);
      this.pendingRequests.delete(decision.requestId);
    }
  }
}
```

#### 3. Wire Through Daemon

**File:** `apps/agor-daemon/src/services/sessions.ts`

```typescript
export class SessionService {
  private permissionService: PermissionService;

  constructor(app: Application) {
    // Initialize permission service with WebSocket emitter
    this.permissionService = new PermissionService((event, data) =>
      app.service('sessions').emit(event, data)
    );
  }

  /**
   * POST /sessions/:id/permission-decision
   */
  async permissionDecision(id: SessionID, data: PermissionDecision) {
    this.permissionService.resolvePermission(data);
    return { success: true };
  }

  // Pass permissionService to ClaudePromptService when executing
  async prompt(id: SessionID, data: { prompt: string }) {
    const claudeTool = new ClaudeTool(
      messagesRepo,
      sessionsRepo,
      apiKey,
      messagesService,
      sessionMCPRepo,
      this.permissionService // <-- Add this!
    );
    return await claudeTool.executePrompt(id, data.prompt);
  }
}
```

**WebSocket Event Emitted:**

```typescript
{
  type: 'permission:request',
  sessionId: string,
  requestId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  timestamp: string
}
```

### Phase 3: UI Components

#### 4. PermissionModal Component

**File:** `apps/agor-ui/src/components/PermissionModal.tsx`

```tsx
interface PermissionModalProps {
  request: PermissionRequest;
  onDecide: (allow: boolean, remember: boolean, scope: 'once' | 'session' | 'project') => void;
}

export function PermissionModal({ request, onDecide }: PermissionModalProps) {
  return (
    <Modal open title="🛡️ Permission Required" onCancel={() => onDecide(false, false, 'once')}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">Session: {request.sessionId.slice(0, 8)}</Text>
        <Title level={4}>{request.toolName}</Title>

        {/* Format tool input nicely */}
        <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
          <pre>{JSON.stringify(request.toolInput, null, 2)}</pre>
        </div>

        {/* Action buttons */}
        <Space>
          <Button danger onClick={() => onDecide(false, false, 'once')}>
            Deny
          </Button>
          <Button type="default" onClick={() => onDecide(true, true, 'session')}>
            Allow for Session
          </Button>
          <Button type="default" onClick={() => onDecide(true, true, 'project')}>
            Allow for Project
          </Button>
          <Button type="primary" onClick={() => onDecide(true, false, 'once')}>
            Allow Once
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}
```

#### 5. usePermissions Hook

**File:** `apps/agor-ui/src/hooks/usePermissions.ts`

```typescript
export function usePermissions(client: AgorClient | null) {
  const [pendingRequest, setPendingRequest] = useState<PermissionRequest | null>(null);

  useEffect(() => {
    if (!client) return;

    const handleRequest = (request: PermissionRequest) => {
      setPendingRequest(request);
    };

    client.service('sessions').on('permission:request', handleRequest);
    return () => client.service('sessions').off('permission:request', handleRequest);
  }, [client]);

  const sendDecision = async (
    allow: boolean,
    remember: boolean,
    scope: 'once' | 'session' | 'project'
  ) => {
    if (!pendingRequest) return;

    await client.service('sessions').permissionDecision(pendingRequest.sessionId, {
      requestId: pendingRequest.requestId,
      allow,
      remember,
      scope,
    });

    setPendingRequest(null);
  };

  return { pendingRequest, sendDecision };
}
```

#### 6. Integrate with App.tsx

**File:** `apps/agor-ui/src/App.tsx`

```typescript
export function App() {
  const client = useAgorClient();
  const { pendingRequest, sendDecision } = usePermissions(client);

  return (
    <>
      {/* Existing UI */}
      <SessionCanvas />

      {/* Permission modal (global, not per-session) */}
      {pendingRequest && (
        <PermissionModal
          request={pendingRequest}
          onDecide={sendDecision}
        />
      )}
    </>
  );
}
```

### Phase 4: Optional Enhancements

#### Tool Status in Conversation View

Show permission state visually in the message stream:

- **⏸️ Awaiting Permission** (yellow badge) - Tool blocked, waiting for user
- **✓ Allowed** (green badge, auto-hide after 2s) - Permission granted
- **✗ Blocked** (red badge) - Permission denied + reason tooltip
- **⚡ Executing...** (blue badge) - Tool running
- **Completed** - Normal tool result display

#### Permission Settings Panel

Add settings UI for managing permissions:

- View/edit project-level allow/deny lists (reads `.claude/settings.json`)
- View/edit session-level allow/deny lists (database)
- Permission mode toggle (normal / auto-accept)
- Reset session permissions button

#### Permission History (Future)

Optional audit trail:

```typescript
// New table: permission_history
{
  permission_id: UUID,
  session_id: SessionID,
  tool_name: string,
  tool_input: Record<string, unknown>,
  decision: 'allow' | 'deny',
  scope: 'once' | 'session' | 'project',
  timestamp: string
}
```

Display in SessionDrawer sidebar tab with "Undo" functionality.

## Key Architectural Benefits

✅ **Piggybacks on SDK** - Uses built-in permission system via `settingSources`
✅ **Async-safe** - PreToolUse hook pauses execution until user decides
✅ **No "permission denied" messages** - Hook intercepts BEFORE Claude tries the tool
✅ **Multi-scope** - Session-level (DB) + Project-level (`.claude/settings.json`)
✅ **Real-time UI** - WebSocket event → Modal → Decision → Query continues
✅ **Standard format** - Reuses Claude Code's `settings.json` schema

## Security Best Practices

### Suggested Default Permissions

**Auto-allow (low-risk, read-only):**

```json
{
  "permissions": {
    "allow": {
      "tools": ["Read", "Glob", "Grep"],
      "bash_commands": ["ls", "pwd", "git status", "git log", "git diff"]
    }
  }
}
```

**Always ask (high-risk):**

- `Bash` (arbitrary commands)
- `Write` / `Edit` (file modifications)
- `WebFetch` (network access)
- `git push` / `git commit` (version control)

### Dangerous Operation Handling

For especially risky operations, the UI can parse tool input and show warnings:

- `rm -rf` → Red warning banner: "⚠️ This will permanently delete files"
- `git push --force` → "⚠️ This will overwrite remote history"
- `curl | bash` → "⚠️ Executing remote code is dangerous"

## Implementation Timeline

**Phase 1 (5 minutes):** Add `'user'` to `settingSources` - Done!
**Phase 2 (1-2 days):** PreToolUse hook + PermissionService + UI modal
**Phase 3 (1 day):** Session/project scope persistence
**Phase 4 (optional):** Settings panel, permission history, tool status badges

## Database Changes Needed

**None for Phase 1!**

**For Phase 2 (session-level overrides):**

The `sessions` table already has a `data` JSON column. No migration needed:

```typescript
Session {
  data: {
    permission_config?: {
      allowedTools?: string[];   // Session-specific allowlist
      deniedTools?: string[];    // Session-specific denylist
    }
  }
}
```

Just update the TypeScript type in `packages/core/src/types/session.ts`.

## References

- [Claude Agent SDK Permissions](https://docs.claude.com/en/api/agent-sdk/permissions)
- [Claude Code Security](https://docs.claude.com/en/docs/claude-code/security)
- [Settings JSON Schema](https://json.schemastore.org/claude-code-settings.json)

---

**Status:** Research Complete, Ready to Implement
**Next Steps:** Phase 1 (5 min) → Test with real session → Phase 2 when needed
**Dependencies:** ✅ ClaudePromptService already exists
