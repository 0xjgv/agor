// src/types/task.ts
import type { TaskID, SessionID } from './id';
import type { ReportPath, ReportTemplate } from './report';

export type TaskStatus = 'created' | 'running' | 'completed' | 'failed';

export interface Task {
  /** Unique task identifier (UUIDv7) */
  task_id: TaskID;

  /** Session this task belongs to */
  session_id: SessionID;

  /** Original user prompt (can be multi-line) */
  full_prompt: string;

  /** Optional: LLM-generated short summary */
  description?: string;

  status: TaskStatus;

  // Message range
  message_range: {
    start_index: number;
    end_index: number;
    start_timestamp: string;
    end_timestamp?: string;
  };

  // Tool usage
  tool_use_count: number;

  // Git state
  git_state: {
    sha_at_start: string;
    sha_at_end?: string;
    commit_message?: string;
  };

  // Model
  model: string;

  // Report (auto-generated after task completion)
  report?: {
    /**
     * File path relative to context/reports/
     * Format: "<session-id>/<task-id>.md"
     */
    path: ReportPath;
    template: ReportTemplate;
    generated_at: string;
  };

  created_at: string;
  completed_at?: string;
}
