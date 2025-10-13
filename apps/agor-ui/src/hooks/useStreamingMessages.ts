/**
 * React hook for real-time streaming messages
 *
 * Tracks messages that are currently being streamed from the daemon.
 * Buffers chunks by message_id and removes from buffer when streaming completes.
 * The complete message will then be available from the database via useMessages.
 */

import type { MessageID, SessionID } from '@agor/core/types';
import { useEffect, useState } from 'react';
import type { useAgorClient } from './useAgorClient';

export interface StreamingMessage {
  message_id: MessageID;
  session_id: SessionID;
  task_id?: string;
  role: 'assistant';
  content: string; // Accumulated chunks
  timestamp: string;
  isStreaming: true;
}

interface StreamingStartEvent {
  message_id: MessageID;
  session_id: SessionID;
  task_id?: string;
  role: 'assistant';
  timestamp: string;
}

interface StreamingChunkEvent {
  message_id: MessageID;
  session_id: SessionID;
  chunk: string;
}

interface StreamingEndEvent {
  message_id: MessageID;
  session_id: SessionID;
}

interface StreamingErrorEvent {
  message_id: MessageID;
  session_id: SessionID;
  error: string;
}

/**
 * Hook to track real-time streaming messages for a session
 *
 * @param client - Agor client instance from useAgorClient
 * @param sessionId - Session ID to filter streaming messages (optional)
 * @returns Map of currently streaming messages keyed by message_id
 */
export function useStreamingMessages(
  client: ReturnType<typeof useAgorClient>['client'],
  sessionId?: SessionID
): Map<MessageID, StreamingMessage> {
  const [streamingMessages, setStreamingMessages] = useState<Map<MessageID, StreamingMessage>>(
    new Map()
  );

  useEffect(() => {
    if (!client) return;

    const messagesService = client.service('messages');

    // Handler for streaming:start
    const handleStreamingStart = (data: StreamingStartEvent) => {
      // Only track messages for this session (if sessionId provided)
      if (sessionId && data.session_id !== sessionId) return;

      console.log(`📡 [UI] Streaming start: ${data.message_id}`);

      setStreamingMessages(prev => {
        const newMap = new Map(prev);
        newMap.set(data.message_id, {
          message_id: data.message_id,
          session_id: data.session_id,
          task_id: data.task_id,
          role: data.role,
          content: '', // Start with empty content
          timestamp: data.timestamp,
          isStreaming: true,
        });
        return newMap;
      });
    };

    // Handler for streaming:chunk
    const handleStreamingChunk = (data: StreamingChunkEvent) => {
      // Only track messages for this session (if sessionId provided)
      if (sessionId && data.session_id !== sessionId) return;

      setStreamingMessages(prev => {
        const message = prev.get(data.message_id);
        if (!message) {
          console.warn(`⚠️  Received chunk for unknown message: ${data.message_id}`);
          return prev;
        }

        const newMap = new Map(prev);
        newMap.set(data.message_id, {
          ...message,
          content: message.content + data.chunk,
        });
        return newMap;
      });
    };

    // Handler for streaming:end
    const handleStreamingEnd = (data: StreamingEndEvent) => {
      // Only track messages for this session (if sessionId provided)
      if (sessionId && data.session_id !== sessionId) return;

      console.log(`📡 [UI] Streaming end: ${data.message_id}`);

      // Remove from streaming buffer (full message now in DB)
      setStreamingMessages(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.message_id);
        return newMap;
      });
    };

    // Handler for streaming:error
    const handleStreamingError = (data: StreamingErrorEvent) => {
      // Only track messages for this session (if sessionId provided)
      if (sessionId && data.session_id !== sessionId) return;

      console.error(`📡 [UI] Streaming error: ${data.message_id}`, data.error);

      // Mark as error but keep content
      setStreamingMessages(prev => {
        const message = prev.get(data.message_id);
        if (!message) return prev;

        const newMap = new Map(prev);
        newMap.set(data.message_id, {
          ...message,
          content: message.content + `\n\n[Error: ${data.error}]`,
        });
        return newMap;
      });
    };

    // Register event listeners
    // biome-ignore lint/suspicious/noExplicitAny: FeathersJS emit types are not strict
    messagesService.on('streaming:start', handleStreamingStart as any);
    // biome-ignore lint/suspicious/noExplicitAny: FeathersJS emit types are not strict
    messagesService.on('streaming:chunk', handleStreamingChunk as any);
    // biome-ignore lint/suspicious/noExplicitAny: FeathersJS emit types are not strict
    messagesService.on('streaming:end', handleStreamingEnd as any);
    // biome-ignore lint/suspicious/noExplicitAny: FeathersJS emit types are not strict
    messagesService.on('streaming:error', handleStreamingError as any);

    // Cleanup on unmount or client change
    return () => {
      // biome-ignore lint/suspicious/noExplicitAny: FeathersJS emit types are not strict
      messagesService.removeListener('streaming:start', handleStreamingStart as any);
      // biome-ignore lint/suspicious/noExplicitAny: FeathersJS emit types are not strict
      messagesService.removeListener('streaming:chunk', handleStreamingChunk as any);
      // biome-ignore lint/suspicious/noExplicitAny: FeathersJS emit types are not strict
      messagesService.removeListener('streaming:end', handleStreamingEnd as any);
      // biome-ignore lint/suspicious/noExplicitAny: FeathersJS emit types are not strict
      messagesService.removeListener('streaming:error', handleStreamingError as any);
    };
  }, [client, sessionId]);

  return streamingMessages;
}
