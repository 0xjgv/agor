// src/types/agent.ts
import type { AgentID } from './id';

export type AgentName = 'claude-code' | 'cursor' | 'codex' | 'gemini';

export interface Agent {
  /** Unique agent configuration identifier (UUIDv7) */
  id: AgentID;

  name: AgentName;
  icon: string;
  installed: boolean;
  version?: string;
  description?: string;
  installable: boolean;
}
