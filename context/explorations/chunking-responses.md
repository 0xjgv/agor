# Streaming Agent Responses

**Status:** Exploration
**Created:** 2025-10-13
**Context:** Agent responses can be long-winded. We need real-time streaming for better UX.

## Problem Statement

Currently, when agents (Claude Agent SDK) generate responses via `/sessions/:id/prompt`, the entire message is created after the agent completes its response. This creates poor UX for long responses:

- User stares at "running" status with no feedback for 10s-60s+
- No indication of what the agent is doing
- Can't see partial output as it's generated
- Messages appear suddenly when complete

**Desired UX:** Stream agent responses word-by-word (or sentence-by-sentence) as they're generated, similar to ChatGPT's typewriter effect.

## Current Architecture

From `apps/agor-daemon/src/index.ts:453-565`:

```typescript
// POST /sessions/:id/prompt
app.use('/sessions/:id/prompt', {
  async create(data: { prompt: string }, params: RouteParams) {
    // Phase 1: Create task immediately with 'running' status
    const task = await tasksService.create({ status: 'running', ... });

    // Phase 2: Execute prompt in background (detached from HTTP request)
    setImmediate(() => {
      claudeTool.executePrompt(id, data.prompt, task.task_id)
        .then(async result => {
          // Phase 3: Mark task as completed
          // Messages already created with task_id
          await tasksService.patch(task.task_id, { status: 'completed' });
        });
    });

    // Return immediately with task ID
    return { success: true, taskId: task.task_id, status: 'running' };
  },
});
```

**Flow:**

1. HTTP request creates task with `status: 'running'`
2. Background execution starts via `setImmediate()`
3. HTTP responds immediately with task ID
4. Agent generates full response (10s-60s)
5. Complete message inserted into DB as single record
6. WebSocket event broadcasts `messages.created` with full message
7. Task marked as `completed`

**Issues:**

- No streaming during generation
- Messages appear atomically after completion
- Long wait with no feedback

## Research Findings

### FeathersJS + Socket.io Capabilities

**Key Insight:** FeathersJS services automatically broadcast CRUD events (`created`, `updated`, `patched`, `removed`) over Socket.io to all connected clients.

**Custom Events:** Services can emit arbitrary custom events via `service.emit(eventName, data)`:

```typescript
// Emit custom event (broadcasts to all connections in channel)
app.service('messages').emit('chunk', {
  message_id,
  session_id,
  chunk: 'Hello world',
});
```

**Client-side listening:**

```typescript
// React hook
useEffect(() => {
  const messagesService = client.service('messages');

  const handleChunk = data => {
    // Append chunk to message buffer
    appendChunk(data.message_id, data.chunk);
  };

  messagesService.on('chunk', handleChunk);

  return () => {
    messagesService.removeListener('chunk', handleChunk);
  };
}, []);
```

**Verdict:** ✅ FeathersJS + Socket.io can easily stream custom events without touching database.

### Anthropic Claude SDK Streaming

The Claude Agent SDK supports streaming via `stream: true` option:

```typescript
const stream = await sdk.messages.create({
  model: 'claude-sonnet-4',
  messages: [...],
  stream: true, // Enable streaming
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
    // Emit chunk over WebSocket
    app.service('messages').emit('chunk', {
      message_id,
      session_id,
      chunk: chunk.delta.text,
    });
  }
}
```

**Chunk sizes:** Anthropic streams text in token-level chunks (1-3 words typically). We can buffer these into larger chunks if needed.

### OpenAI Streaming Best Practices

From research on Server-Sent Events (SSE) and streaming APIs:

**Chunk size considerations:**

- **Token-level (1-3 words):** Good for real-time typewriter effect, but high WebSocket overhead
- **Sentence-level (10-30 words):** Balanced, feels responsive without excessive events
- **Paragraph-level (50-100 words):** Lower overhead, but less real-time feel

**Buffering strategy:**

- Buffer tokens until punctuation (`.`, `!`, `?`, `\n\n`) for sentence-level chunks
- Or buffer by word count (every 5-10 words)
- Or buffer by time (every 100-200ms)

**Verdict:** 🎯 **Sentence-level chunks** (every 5-10 words or at punctuation) provide best UX/performance balance.

## Architecture Options

### Option 1: Stream-Only (No Database Updates) - RECOMMENDED

**Pattern:** Stream chunks over WebSocket, write complete message to DB at end.

```typescript
// Pseudo-code
async function executePromptWithStreaming(sessionId, prompt, taskId) {
  const assistantMessageId = uuidv7();
  let fullContent = '';

  // Emit "message started" event
  app.service('messages').emit('streaming:start', {
    message_id: assistantMessageId,
    session_id: sessionId,
    task_id: taskId,
    role: 'assistant',
  });

  // Stream from Claude SDK
  const stream = await claudeSDK.messages.create({
    messages: [...],
    stream: true
  });

  let buffer = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      fullContent += chunk.delta.text;
      buffer += chunk.delta.text;

      // Emit when buffer reaches threshold (5-10 words or punctuation)
      if (shouldFlush(buffer)) {
        app.service('messages').emit('streaming:chunk', {
          message_id: assistantMessageId,
          session_id: sessionId,
          chunk: buffer,
        });
        buffer = '';
      }
    }
  }

  // Flush remaining buffer
  if (buffer) {
    app.service('messages').emit('streaming:chunk', {
      message_id: assistantMessageId,
      session_id: sessionId,
      chunk: buffer,
    });
  }

  // Write complete message to database (ONCE at end)
  await messagesService.create({
    message_id: assistantMessageId,
    session_id: sessionId,
    task_id: taskId,
    role: 'assistant',
    type: 'assistant',
    content: fullContent,
    content_preview: fullContent.substring(0, 200),
  });

  // Emit "message completed" event
  app.service('messages').emit('streaming:end', {
    message_id: assistantMessageId,
    session_id: sessionId,
  });
}

function shouldFlush(buffer) {
  // Flush at punctuation or every 10 words
  const wordCount = buffer.split(/\s+/).length;
  const hasPunctuation = /[.!?\n\n]$/.test(buffer);
  return wordCount >= 10 || hasPunctuation;
}
```

**UI Integration:**

```typescript
// React component
const [streamingMessages, setStreamingMessages] = useState<Map<MessageID, string>>(new Map());

useEffect(() => {
  const messagesService = client.service('messages');

  messagesService.on('streaming:start', data => {
    // Initialize empty message buffer
    setStreamingMessages(prev => new Map(prev).set(data.message_id, ''));
  });

  messagesService.on('streaming:chunk', data => {
    // Append chunk to buffer
    setStreamingMessages(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(data.message_id) || '';
      newMap.set(data.message_id, current + data.chunk);
      return newMap;
    });
  });

  messagesService.on('streaming:end', data => {
    // Remove from streaming buffer (full message now in DB)
    setStreamingMessages(prev => {
      const newMap = new Map(prev);
      newMap.delete(data.message_id);
      return newMap;
    });
  });

  return () => {
    messagesService.removeAllListeners('streaming:start');
    messagesService.removeAllListeners('streaming:chunk');
    messagesService.removeAllListeners('streaming:end');
  };
}, []);

// Render: Merge streaming messages with DB messages
const allMessages = useMemo(() => {
  return [
    ...dbMessages,
    ...Array.from(streamingMessages.entries()).map(([id, content]) => ({
      message_id: id,
      content,
      isStreaming: true,
    })),
  ];
}, [dbMessages, streamingMessages]);
```

**Pros:**

- ✅ Zero database overhead during streaming
- ✅ Simple: single INSERT at end (no PATCH operations)
- ✅ Works seamlessly with existing message storage
- ✅ No risk of incomplete messages in DB
- ✅ Efficient: only final message persisted

**Cons:**

- ❌ Streaming state lost on client disconnect (need to re-fetch from DB)
- ❌ Requires client-side buffer management

**Verdict:** 🎯 **RECOMMENDED** - Best balance of performance and simplicity.

---

### Option 2: Incremental Database Updates

**Pattern:** Update message in database as chunks arrive (in-place updates).

```typescript
async function executePromptWithStreaming(sessionId, prompt, taskId) {
  const assistantMessageId = uuidv7();
  let fullContent = '';

  // Create placeholder message in DB
  await messagesService.create({
    message_id: assistantMessageId,
    session_id: sessionId,
    task_id: taskId,
    role: 'assistant',
    content: '',
    content_preview: '...',
    metadata: { streaming: true },
  });

  // Stream and update DB on each chunk
  const stream = await claudeSDK.messages.create({ stream: true });

  let buffer = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      fullContent += chunk.delta.text;
      buffer += chunk.delta.text;

      if (shouldFlush(buffer)) {
        // UPDATE database with new content
        await messagesService.patch(assistantMessageId, {
          content: fullContent,
          content_preview: fullContent.substring(0, 200),
        });

        buffer = '';
      }
    }
  }

  // Final update: mark as complete
  await messagesService.patch(assistantMessageId, {
    content: fullContent,
    content_preview: fullContent.substring(0, 200),
    metadata: { streaming: false },
  });
}
```

**Pros:**

- ✅ Streaming state persisted in DB (survives reconnects)
- ✅ Client can refresh and see current partial message
- ✅ Simpler client-side (just read from DB)

**Cons:**

- ❌ High database write overhead (N PATCH operations per message)
- ❌ Triggers N WebSocket `patched` events (broadcast overhead)
- ❌ Potential SQLite lock contention
- ❌ Partial messages visible in DB (could confuse historical queries)
- ❌ Requires tombstone cleanup or `streaming: true` flag checks

**Verdict:** ❌ **NOT RECOMMENDED** - Too much DB overhead for marginal benefit.

---

### Option 3: Hybrid (Stream + Append-Only Log)

**Pattern:** Stream over WebSocket + write chunks to append-only log table.

```typescript
// New table: message_chunks
export const messageChunks = sqliteTable('message_chunks', {
  chunk_id: text('chunk_id').primaryKey(),
  message_id: text('message_id').notNull(),
  session_id: text('session_id').notNull(),
  index: integer('index').notNull(), // 0, 1, 2, ...
  content: text('content').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

async function executePromptWithStreaming(sessionId, prompt, taskId) {
  const assistantMessageId = uuidv7();
  let fullContent = '';
  let chunkIndex = 0;

  // Emit "message started" event
  app.service('messages').emit('streaming:start', { message_id: assistantMessageId });

  const stream = await claudeSDK.messages.create({ stream: true });

  let buffer = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      fullContent += chunk.delta.text;
      buffer += chunk.delta.text;

      if (shouldFlush(buffer)) {
        // Append chunk to log table
        await messageChunksRepo.create({
          message_id: assistantMessageId,
          session_id: sessionId,
          index: chunkIndex++,
          content: buffer,
        });

        // Emit chunk over WebSocket
        app.service('messages').emit('streaming:chunk', {
          message_id: assistantMessageId,
          chunk: buffer,
        });

        buffer = '';
      }
    }
  }

  // Write final message to messages table
  await messagesService.create({
    message_id: assistantMessageId,
    content: fullContent,
    // ...
  });

  // Optionally: Clean up chunks after final message written
  // await messageChunksRepo.deleteByMessage(assistantMessageId);
}
```

**Pros:**

- ✅ Streaming state persisted (survives reconnects)
- ✅ Append-only log (no UPDATE queries)
- ✅ Can replay streaming for debugging/analytics
- ✅ Final message still clean in messages table

**Cons:**

- ❌ Additional table and schema complexity
- ❌ Requires chunk cleanup (or keep forever for replay)
- ❌ Still adds DB writes during streaming (though less contention than PATCH)

**Verdict:** ⚠️ **OVERKILL** - Only useful if we need streaming replay or analytics.

---

## Recommendation: Option 1 (Stream-Only)

**Why:**

1. **Performance:** Zero database overhead during streaming
2. **Simplicity:** Single INSERT when complete (existing code path)
3. **Clean data model:** No partial messages in DB
4. **FeathersJS native:** Custom events are first-class in Socket.io

**Implementation Plan:**

### Phase 1: Add Streaming to ClaudeTool

**File:** `packages/core/src/tools/claude.ts`

```typescript
export class ClaudeTool {
  constructor(
    private messagesRepo: MessagesRepository,
    private sessionsRepo: SessionRepository,
    private apiKey: string,
    private messagesService: any // FeathersJS service for emitting events
    // ...
  ) {}

  async executePromptWithStreaming(
    sessionId: SessionID,
    prompt: string,
    taskId: TaskID,
    permissionMode?: PermissionMode
  ): Promise<{ assistantMessageIds: MessageID[] }> {
    // Create user message (still synchronous)
    const userMessageId = await this.createUserMessage(sessionId, taskId, prompt);

    // Stream assistant response
    const assistantMessageId = uuidv7() as MessageID;
    let fullContent = '';

    // Emit streaming:start
    this.messagesService.emit('streaming:start', {
      message_id: assistantMessageId,
      session_id: sessionId,
      task_id: taskId,
      role: 'assistant',
      timestamp: new Date().toISOString(),
    });

    try {
      const stream = await this.client.messages.create({
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        // ...
      });

      let buffer = '';
      let wordCount = 0;

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const text = chunk.delta.text;
          fullContent += text;
          buffer += text;

          // Count words in buffer
          wordCount = buffer.split(/\s+/).filter(w => w.length > 0).length;

          // Flush at 8-10 words or sentence boundaries
          const hasSentenceBoundary = /[.!?\n\n]\s*$/.test(buffer);
          if (wordCount >= 8 || (hasSentenceBoundary && wordCount >= 3)) {
            this.messagesService.emit('streaming:chunk', {
              message_id: assistantMessageId,
              session_id: sessionId,
              chunk: buffer,
            });
            buffer = '';
            wordCount = 0;
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        this.messagesService.emit('streaming:chunk', {
          message_id: assistantMessageId,
          session_id: sessionId,
          chunk: buffer,
        });
      }

      // Write complete message to DB
      await this.messagesRepo.create({
        message_id: assistantMessageId,
        session_id: sessionId,
        task_id: taskId,
        role: 'assistant',
        type: 'assistant',
        content: fullContent,
        content_preview: fullContent.substring(0, 200),
        index: await this.getNextMessageIndex(sessionId),
        timestamp: new Date().toISOString(),
      });

      // Emit streaming:end
      this.messagesService.emit('streaming:end', {
        message_id: assistantMessageId,
        session_id: sessionId,
      });

      return { assistantMessageIds: [assistantMessageId] };
    } catch (error) {
      // Emit streaming:error
      this.messagesService.emit('streaming:error', {
        message_id: assistantMessageId,
        session_id: sessionId,
        error: error.message,
      });
      throw error;
    }
  }
}
```

### Phase 2: Update Daemon Route

**File:** `apps/agor-daemon/src/index.ts`

```typescript
app.use('/sessions/:id/prompt', {
  async create(data: { prompt: string; stream?: boolean }, params: RouteParams) {
    const id = params.route?.id;
    if (!id) throw new Error('Session ID required');

    // ... create task as before ...

    // Use streaming if requested (default: true)
    const useStreaming = data.stream !== false;

    setImmediate(() => {
      const executeFunc = useStreaming
        ? claudeTool.executePromptWithStreaming
        : claudeTool.executePrompt;

      executeFunc
        .call(claudeTool, id as SessionID, data.prompt, task.task_id)
        .then(/* ... handle completion ... */)
        .catch(/* ... handle error ... */);
    });

    return {
      success: true,
      taskId: task.task_id,
      status: 'running',
      streaming: useStreaming,
    };
  },
});
```

### Phase 3: UI Streaming Hook

**File:** `apps/agor-ui/src/hooks/useStreamingMessages.ts`

```typescript
import { useEffect, useState } from 'react';
import type { MessageID, SessionID } from '@agor/core/types';
import { useAgorClient } from './useAgorClient';

interface StreamingMessage {
  message_id: MessageID;
  session_id: SessionID;
  task_id?: string;
  role: 'assistant';
  content: string;
  timestamp: string;
  isStreaming: true;
}

export function useStreamingMessages(sessionId?: SessionID) {
  const client = useAgorClient();
  const [streamingMessages, setStreamingMessages] = useState<Map<MessageID, StreamingMessage>>(
    new Map()
  );

  useEffect(() => {
    if (!client || !sessionId) return;

    const messagesService = client.service('messages');

    const handleStreamingStart = (data: {
      message_id: MessageID;
      session_id: SessionID;
      task_id?: string;
      role: 'assistant';
      timestamp: string;
    }) => {
      // Only track messages for this session
      if (data.session_id !== sessionId) return;

      setStreamingMessages(prev => {
        const newMap = new Map(prev);
        newMap.set(data.message_id, {
          message_id: data.message_id,
          session_id: data.session_id,
          task_id: data.task_id,
          role: data.role,
          content: '',
          timestamp: data.timestamp,
          isStreaming: true,
        });
        return newMap;
      });
    };

    const handleStreamingChunk = (data: {
      message_id: MessageID;
      session_id: SessionID;
      chunk: string;
    }) => {
      if (data.session_id !== sessionId) return;

      setStreamingMessages(prev => {
        const message = prev.get(data.message_id);
        if (!message) return prev;

        const newMap = new Map(prev);
        newMap.set(data.message_id, {
          ...message,
          content: message.content + data.chunk,
        });
        return newMap;
      });
    };

    const handleStreamingEnd = (data: { message_id: MessageID; session_id: SessionID }) => {
      if (data.session_id !== sessionId) return;

      // Remove from streaming buffer (full message now in DB)
      setStreamingMessages(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.message_id);
        return newMap;
      });
    };

    const handleStreamingError = (data: {
      message_id: MessageID;
      session_id: SessionID;
      error: string;
    }) => {
      if (data.session_id !== sessionId) return;

      console.error(`Streaming error for message ${data.message_id}:`, data.error);

      // Mark as error but keep content
      setStreamingMessages(prev => {
        const message = prev.get(data.message_id);
        if (!message) return prev;

        const newMap = new Map(prev);
        newMap.set(data.message_id, {
          ...message,
          content: message.content + '\n\n[Error: ' + data.error + ']',
        });
        return newMap;
      });
    };

    messagesService.on('streaming:start', handleStreamingStart);
    messagesService.on('streaming:chunk', handleStreamingChunk);
    messagesService.on('streaming:end', handleStreamingEnd);
    messagesService.on('streaming:error', handleStreamingError);

    return () => {
      messagesService.removeListener('streaming:start', handleStreamingStart);
      messagesService.removeListener('streaming:chunk', handleStreamingChunk);
      messagesService.removeListener('streaming:end', handleStreamingEnd);
      messagesService.removeListener('streaming:error', handleStreamingError);
    };
  }, [client, sessionId]);

  return streamingMessages;
}
```

### Phase 4: Integrate in SessionDrawer

**File:** `apps/agor-ui/src/components/SessionDrawer/SessionDrawer.tsx`

```typescript
import { useStreamingMessages } from '../../hooks/useStreamingMessages';

export const SessionDrawer: React.FC<SessionDrawerProps> = ({ sessionId, ... }) => {
  // Existing: Fetch messages from DB
  const { messages: dbMessages, loading } = useAgorData('messages', {
    session_id: sessionId,
  });

  // New: Track streaming messages
  const streamingMessages = useStreamingMessages(sessionId);

  // Merge DB messages + streaming messages
  const allMessages = useMemo(() => {
    const streaming = Array.from(streamingMessages.values());
    return [...(dbMessages || []), ...streaming].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );
  }, [dbMessages, streamingMessages]);

  return (
    <Drawer {...props}>
      <div className="messages">
        {allMessages.map(message => (
          <MessageBubble
            key={message.message_id}
            message={message}
            isStreaming={message.isStreaming}
          />
        ))}
      </div>
    </Drawer>
  );
};
```

**File:** `apps/agor-ui/src/components/MessageBubble.tsx`

```typescript
interface MessageBubbleProps {
  message: Message | StreamingMessage;
  isStreaming?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming }) => {
  return (
    <div className={`message message--${message.role}`}>
      <div className="message__content">
        {message.content}
        {isStreaming && <span className="message__cursor">▊</span>}
      </div>
    </div>
  );
};
```

```css
/* Blinking cursor for streaming messages */
.message__cursor {
  animation: blink 1s infinite;
  margin-left: 2px;
}

@keyframes blink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}
```

---

## Chunk Size Analysis

**Research findings:**

- **Anthropic SDK:** Streams token-level chunks (1-3 words)
- **OpenAI best practices:** Sentence-level buffering (10-30 words)
- **WebSocket overhead:** Each emit has ~50-100 bytes of framing

**Recommendation: 5-10 word chunks**

**Why:**

1. **Responsive UX:** User sees progress every 1-2 seconds (assuming ~200-400 words/min generation)
2. **Low overhead:** ~10-20 events per message (vs. 100s for token-level)
3. **Natural boundaries:** Flush at punctuation (`.`, `!`, `?`) creates readable chunks

**Tuning parameters:**

```typescript
const CHUNK_MIN_WORDS = 5; // Minimum words before considering flush
const CHUNK_MAX_WORDS = 10; // Force flush at this limit
const CHUNK_PUNCTUATION = /[.!?\n\n]\s*$/; // Flush at sentence boundaries
```

**Example chunks:**

```
Original: "The React component uses useState to manage the form state. Each field has its own state variable. We use useEffect to validate on change."

Chunk 1: "The React component uses useState to manage the form state."
Chunk 2: "Each field has its own state variable."
Chunk 3: "We use useEffect to validate on change."
```

---

## Multiplayer Considerations

**Question:** Should streaming be broadcast to all users watching the same session?

**Answer:** YES - Automatic via FeathersJS channels!

From `apps/agor-daemon/src/index.ts:98-106`:

```typescript
// Configure channels to broadcast events to all connected clients
app.on('connection', connection => {
  app.channel('everybody').join(connection);
});

app.publish(() => {
  return app.channel('everybody');
});
```

**All Socket.io events (including custom `streaming:*` events) are automatically broadcast to all connected clients.**

**Multiplayer UX:**

- User A prompts Claude in session X
- Users B and C (also viewing session X) see the response streaming in real-time
- All three users see the same typewriter effect simultaneously

**No additional code needed!** FeathersJS channels handle broadcast automatically.

---

## Edge Cases & Error Handling

### 1. Client Disconnect During Streaming

**Problem:** User closes browser tab while message streaming.

**Solution:**

- Server continues streaming (generates full message)
- Server writes complete message to DB at end
- Client reconnects and fetches from DB (sees full message, not streaming)

**No data loss!**

### 2. Server Crash During Streaming

**Problem:** Daemon crashes mid-stream.

**Solution:**

- Task remains in `running` state (never marked `completed`)
- Client sees task stuck as "running"
- User can retry or manually mark as failed

**Future enhancement:** Add task timeout detection to mark orphaned tasks as `failed`.

### 3. Network Lag / Out-of-Order Chunks

**Problem:** WebSocket chunks arrive out of order.

**Solution:**

- Socket.io guarantees ordered delivery over TCP
- Not a concern with current architecture

**If using UDP-based transport (future):** Add sequence numbers to chunks.

### 4. Multiple Concurrent Prompts

**Problem:** User sends two prompts simultaneously to same session.

**Solution:**

- Each prompt creates separate task with unique `task_id`
- Each creates separate message with unique `message_id`
- Streaming events include `message_id` → client buffers correctly
- No conflicts!

---

## Performance Analysis

### Database Impact

**Current (non-streaming):**

- 1 INSERT per message (user + assistant)
- ~2-4 INSERTs per prompt execution

**Streaming (Option 1):**

- 1 INSERT per message (user + assistant)
- ~2-4 INSERTs per prompt execution

**No change!** Streaming is purely WebSocket-based, zero DB overhead.

### Network Bandwidth

**Assumptions:**

- Average message: 500 words = ~3000 characters
- Chunk size: 8 words = ~48 characters
- Chunks per message: ~60

**Bandwidth per message:**

- Chunk data: 60 chunks × 48 bytes = 2.88 KB
- WebSocket framing: 60 events × ~80 bytes = 4.8 KB
- **Total:** ~7.7 KB (vs. 3 KB for single message)

**Overhead:** ~2.5x bandwidth, but spread over 10-60 seconds (negligible for local daemon).

### CPU Impact

**Socket.io emit overhead:**

- ~0.1ms per emit (negligible)
- 60 chunks × 0.1ms = 6ms CPU time

**Verdict:** ✅ Negligible performance impact.

---

## Migration Path

### Phase 1: Add Streaming Support (Non-Breaking)

- Add `executePromptWithStreaming()` to ClaudeTool
- Add `stream: boolean` parameter to `/sessions/:id/prompt` (default: `false`)
- Add streaming event listeners to UI (no-op if streaming disabled)

**Backward compatible!** Existing code uses `stream: false` by default.

### Phase 2: Enable Streaming by Default

- Change default to `stream: true`
- Monitor for issues

### Phase 3: Remove Non-Streaming Code Path

- Deprecate `executePrompt()` (always stream)
- Simplify codebase

---

## TypeScript Types

```typescript
// packages/core/src/types/streaming.ts

export interface StreamingStartEvent {
  message_id: MessageID;
  session_id: SessionID;
  task_id?: TaskID;
  role: 'assistant';
  timestamp: string;
}

export interface StreamingChunkEvent {
  message_id: MessageID;
  session_id: SessionID;
  chunk: string;
}

export interface StreamingEndEvent {
  message_id: MessageID;
  session_id: SessionID;
}

export interface StreamingErrorEvent {
  message_id: MessageID;
  session_id: SessionID;
  error: string;
}

// Augment FeathersJS service events
declare module '@feathersjs/feathers' {
  interface ServiceAddons {
    on(event: 'streaming:start', handler: (data: StreamingStartEvent) => void): this;
    on(event: 'streaming:chunk', handler: (data: StreamingChunkEvent) => void): this;
    on(event: 'streaming:end', handler: (data: StreamingEndEvent) => void): this;
    on(event: 'streaming:error', handler: (data: StreamingErrorEvent) => void): this;
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('ClaudeTool.executePromptWithStreaming', () => {
  it('should emit streaming:start event', async () => {
    const emitSpy = jest.spyOn(messagesService, 'emit');

    await claudeTool.executePromptWithStreaming(sessionId, 'test prompt', taskId);

    expect(emitSpy).toHaveBeenCalledWith('streaming:start', {
      message_id: expect.any(String),
      session_id: sessionId,
      role: 'assistant',
    });
  });

  it('should chunk at sentence boundaries', async () => {
    const emitSpy = jest.spyOn(messagesService, 'emit');

    // Mock Claude SDK to return known chunks
    mockClaudeSDK.mockChunks(['Hello ', 'world. ', 'This ', 'is ', 'a ', 'test.']);

    await claudeTool.executePromptWithStreaming(sessionId, 'test', taskId);

    const chunkEvents = emitSpy.mock.calls.filter(c => c[0] === 'streaming:chunk');
    expect(chunkEvents[0][1].chunk).toBe('Hello world.');
    expect(chunkEvents[1][1].chunk).toBe('This is a test.');
  });
});
```

### Integration Tests

```typescript
describe('Streaming Integration', () => {
  it('should broadcast streaming events to all connected clients', async () => {
    // Connect two clients
    const client1 = await connectClient();
    const client2 = await connectClient();

    const chunks1: string[] = [];
    const chunks2: string[] = [];

    client1.service('messages').on('streaming:chunk', data => {
      chunks1.push(data.chunk);
    });

    client2.service('messages').on('streaming:chunk', data => {
      chunks2.push(data.chunk);
    });

    // Send prompt from client1
    await client1.service('sessions').prompt(sessionId, 'test prompt');

    await waitForStreaming();

    // Both clients should receive same chunks
    expect(chunks1).toEqual(chunks2);
    expect(chunks1.length).toBeGreaterThan(0);
  });
});
```

---

## Future Enhancements

### 1. Adaptive Chunk Sizing

Adjust chunk size based on message velocity:

- **Fast generation (>500 words/min):** Larger chunks (15-20 words) to reduce events
- **Slow generation (<100 words/min):** Smaller chunks (3-5 words) for more responsive feel

### 2. Markdown Streaming

Buffer chunks to avoid breaking markdown syntax:

````typescript
// Wait for complete markdown block before flushing
const codeBlockRegex = /```[\s\S]*?```/;
if (buffer.match(codeBlockRegex)) {
  flush(); // Complete code block
}
````

### 3. Tool Use Streaming

Stream tool calls as they execute:

```typescript
app.service('messages').emit('streaming:tool-use', {
  message_id: assistantMessageId,
  tool_name: 'Read',
  tool_input: { file_path: '/path/to/file' },
  status: 'running',
});
```

### 4. Compression

For large messages, compress chunks before sending:

```typescript
import { gzip } from 'zlib';

const compressed = await gzip(chunk);
app.service('messages').emit('streaming:chunk', {
  message_id: assistantMessageId,
  chunk: compressed.toString('base64'),
  encoding: 'gzip',
});
```

---

---

## Agent Tool Abstraction

To support streaming across multiple agent integrations (Claude Code, Cursor, Codex, Gemini), we need a clean abstraction in the tool interface.

### Requirements

1. **Streaming is OPTIONAL** - Not all agents support streaming (e.g., Cursor may not expose streaming API)
2. **Final message broadcast is MANDATORY** - All agents MUST broadcast complete message via `messagesService.create()`
3. **Streaming callback interface** - Agents that support streaming use callback pattern

### Updated Base Types

**File:** `packages/core/src/tools/base/types.ts`

```typescript
/**
 * Streaming callback interface for agents that support real-time streaming
 *
 * Agents call these callbacks during message generation to provide progressive updates.
 * If agent doesn't support streaming, it simply calls messagesService.create() at end.
 */
export interface StreamingCallbacks {
  /**
   * Called when message streaming starts
   *
   * @param messageId - Unique ID for this message (agent generates via uuidv7)
   * @param metadata - Initial metadata (role, timestamp, etc.)
   */
  onStreamStart(
    messageId: MessageID,
    metadata: {
      session_id: SessionID;
      task_id?: TaskID;
      role: 'assistant';
      timestamp: string;
    }
  ): void;

  /**
   * Called for each chunk of streamed content
   *
   * @param messageId - Message being streamed
   * @param chunk - Text chunk (3-10 words recommended)
   */
  onStreamChunk(messageId: MessageID, chunk: string): void;

  /**
   * Called when streaming completes successfully
   *
   * Agent must still call messagesService.create() with full message after this!
   * This is just a signal to clean up streaming UI state.
   *
   * @param messageId - Message that finished streaming
   */
  onStreamEnd(messageId: MessageID): void;

  /**
   * Called if streaming encounters an error
   *
   * @param messageId - Message that failed
   * @param error - Error that occurred
   */
  onStreamError(messageId: MessageID, error: Error): void;
}

/**
 * Tool capabilities - feature flags for what each tool supports
 */
export interface ToolCapabilities {
  /** Can import historical sessions from tool's storage */
  supportsSessionImport: boolean;

  /** Can create new sessions via SDK/API */
  supportsSessionCreate: boolean;

  /** Can send prompts and receive responses */
  supportsLiveExecution: boolean;

  /** Can fork sessions at specific points */
  supportsSessionFork: boolean;

  /** Can spawn child sessions for subtasks */
  supportsChildSpawn: boolean;

  /** Tracks git state natively */
  supportsGitState: boolean;

  /** Streams responses in real-time (optional UX enhancement) */
  supportsStreaming: boolean; // ← New flag
}
```

### Updated ITool Interface

**File:** `packages/core/src/tools/base/tool.interface.ts`

```typescript
export interface ITool {
  // ... existing methods ...

  /**
   * Execute task (send prompt) in existing session
   *
   * MANDATORY: Must call messagesService.create() with complete message when done.
   * OPTIONAL: If supportsStreaming=true, may also call streamingCallbacks during execution.
   *
   * @param sessionId - Session identifier
   * @param prompt - User prompt
   * @param taskId - Task identifier (for linking messages)
   * @param streamingCallbacks - Optional callbacks for real-time streaming
   * @returns Task result with message IDs
   */
  executeTask?(
    sessionId: string,
    prompt: string,
    taskId?: string,
    streamingCallbacks?: StreamingCallbacks
  ): Promise<TaskResult>;
}
```

### Implementation Example: ClaudeTool with Streaming

**File:** `packages/core/src/tools/claude/claude-tool.ts`

```typescript
export class ClaudeTool implements ITool {
  // ...

  getCapabilities(): ToolCapabilities {
    return {
      // ...
      supportsStreaming: true, // ✅ Claude Agent SDK supports streaming
    };
  }

  async executeTask(
    sessionId: SessionID,
    prompt: string,
    taskId?: TaskID,
    streamingCallbacks?: StreamingCallbacks
  ): Promise<TaskResult> {
    // Create user message (synchronous)
    const userMessage = await this.messagesService.create({
      session_id: sessionId,
      task_id: taskId,
      role: 'user',
      content: prompt,
      // ...
    });

    // Execute with streaming if callbacks provided
    const assistantMessageId = uuidv7() as MessageID;
    let fullContent = '';

    // OPTIONAL: Stream if callbacks provided
    if (streamingCallbacks && this.getCapabilities().supportsStreaming) {
      streamingCallbacks.onStreamStart(assistantMessageId, {
        session_id: sessionId,
        task_id: taskId,
        role: 'assistant',
        timestamp: new Date().toISOString(),
      });

      try {
        const stream = await this.claudeSDK.messages.create({
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        });

        let buffer = '';
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const text = chunk.delta.text;
            fullContent += text;
            buffer += text;

            // Flush every 3-5 words
            if (shouldFlush(buffer)) {
              streamingCallbacks.onStreamChunk(assistantMessageId, buffer);
              buffer = '';
            }
          }
        }

        // Flush remaining
        if (buffer) {
          streamingCallbacks.onStreamChunk(assistantMessageId, buffer);
        }

        streamingCallbacks.onStreamEnd(assistantMessageId);
      } catch (error) {
        streamingCallbacks.onStreamError(assistantMessageId, error);
        throw error;
      }
    } else {
      // No streaming - just execute and wait
      const result = await this.claudeSDK.messages.create({
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      });
      fullContent = result.content[0].text;
    }

    // MANDATORY: Write complete message to DB (triggers WebSocket broadcast)
    const assistantMessage = await this.messagesService.create({
      message_id: assistantMessageId,
      session_id: sessionId,
      task_id: taskId,
      role: 'assistant',
      content: fullContent,
      // ...
    });

    return {
      taskId: taskId || uuidv7(),
      status: 'completed',
      messages: [userMessage, assistantMessage],
      completedAt: new Date(),
    };
  }
}
```

### Implementation Example: CursorTool WITHOUT Streaming

**File:** `packages/core/src/tools/cursor/cursor-tool.ts` (future)

```typescript
export class CursorTool implements ITool {
  // ...

  getCapabilities(): ToolCapabilities {
    return {
      // ...
      supportsStreaming: false, // ❌ Cursor CLI doesn't expose streaming
    };
  }

  async executeTask(
    sessionId: SessionID,
    prompt: string,
    taskId?: TaskID,
    streamingCallbacks?: StreamingCallbacks // Ignored for Cursor
  ): Promise<TaskResult> {
    // Create user message
    const userMessage = await this.messagesService.create({
      session_id: sessionId,
      task_id: taskId,
      role: 'user',
      content: prompt,
      // ...
    });

    // Execute via Cursor CLI (blocks until complete)
    const result = await execCursorCLI(['run', prompt]);
    const fullContent = result.stdout;

    // MANDATORY: Write complete message to DB (triggers WebSocket broadcast)
    const assistantMessage = await this.messagesService.create({
      message_id: uuidv7() as MessageID,
      session_id: sessionId,
      task_id: taskId,
      role: 'assistant',
      content: fullContent,
      // ...
    });

    // Streaming callbacks never called - UI shows loading spinner, then full message
    return {
      taskId: taskId || uuidv7(),
      status: 'completed',
      messages: [userMessage, assistantMessage],
      completedAt: new Date(),
    };
  }
}
```

### Daemon Integration

**File:** `apps/agor-daemon/src/index.ts`

```typescript
app.use('/sessions/:id/prompt', {
  async create(data: { prompt: string }, params: RouteParams) {
    const id = params.route?.id;
    if (!id) throw new Error('Session ID required');

    // Create task
    const task = await tasksService.create({ status: 'running' /* ... */ });

    // Get tool for this session's agent type
    const session = await sessionsService.get(id);
    const tool = getToolForAgent(session.agent); // Returns ClaudeTool, CursorTool, etc.

    // Create streaming callbacks (FeathersJS emits over WebSocket)
    const streamingCallbacks: StreamingCallbacks = {
      onStreamStart: (messageId, metadata) => {
        app.service('messages').emit('streaming:start', {
          message_id: messageId,
          ...metadata,
        });
      },
      onStreamChunk: (messageId, chunk) => {
        app.service('messages').emit('streaming:chunk', {
          message_id: messageId,
          session_id: id,
          chunk,
        });
      },
      onStreamEnd: messageId => {
        app.service('messages').emit('streaming:end', {
          message_id: messageId,
          session_id: id,
        });
      },
      onStreamError: (messageId, error) => {
        app.service('messages').emit('streaming:error', {
          message_id: messageId,
          session_id: id,
          error: error.message,
        });
      },
    };

    // Execute in background
    setImmediate(() => {
      tool
        .executeTask(id, data.prompt, task.task_id, streamingCallbacks)
        .then(async result => {
          // Mark task as completed
          await tasksService.patch(task.task_id, { status: 'completed' });
        })
        .catch(async error => {
          // Mark task as failed
          await tasksService.patch(task.task_id, { status: 'failed' });
        });
    });

    return {
      success: true,
      taskId: task.task_id,
      status: 'running',
      supportsStreaming: tool.getCapabilities().supportsStreaming,
    };
  },
});
```

### UI Integration (Universal)

The UI doesn't need to know which agent is being used! It just:

1. Listens for `streaming:*` events (if they arrive, show streaming)
2. Listens for `messages.created` event (always arrives with final message)
3. Merges streaming + DB messages (streaming superseded by DB when complete)

**This works for all agents:**

- **Claude Code:** Streams chunks → shows typewriter effect → DB message supersedes
- **Cursor:** No streaming → shows loading spinner → DB message appears suddenly
- **Codex/Gemini:** May or may not stream (depends on SDK capabilities)

### Summary: Contract

**For all agent tools:**

✅ **MUST** call `messagesService.create()` with complete message when done
✅ **MUST** broadcast complete message (automatic via FeathersJS)

**For streaming-capable agent tools:**

✅ **MAY** call `streamingCallbacks` during execution for progressive UX
✅ **MUST** set `supportsStreaming: true` in capabilities
✅ **SHOULD** chunk at 3-10 words for optimal UX

**For non-streaming agent tools:**

✅ Set `supportsStreaming: false` in capabilities
✅ Ignore `streamingCallbacks` parameter
✅ Users see loading spinner, then full message appears

---

## References

- FeathersJS Real-time Events: https://feathersjs.com/api/events.html
- Socket.io Emit: https://socket.io/docs/v4/emitting-events/
- Anthropic Streaming API: https://docs.anthropic.com/en/api/messages-streaming
- OpenAI Streaming: https://platform.openai.com/docs/guides/streaming-responses
- Server-Sent Events Guide: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
