/**
 * Sessions Service
 *
 * Provides REST + WebSocket API for session management.
 * Uses DrizzleService adapter with SessionRepository.
 */

import { type Database, SessionRepository } from '@agor/core/db';
import type { Session } from '@agor/core/types';
import type { Paginated, Params } from '@feathersjs/feathers';
import { DrizzleService } from '../adapters/drizzle';

/**
 * Session service params
 */
export interface SessionParams extends Params {
  query?: {
    status?: Session['status'];
    agent?: Session['agent'];
    board_id?: string;
    $limit?: number;
    $skip?: number;
    $sort?: Record<string, 1 | -1>;
    $select?: string[];
  };
}

/**
 * Extended sessions service with custom methods
 */
export class SessionsService extends DrizzleService<Session, Partial<Session>, SessionParams> {
  private sessionRepo: SessionRepository;

  constructor(db: Database) {
    const sessionRepo = new SessionRepository(db);
    super(sessionRepo, {
      id: 'session_id',
      paginate: {
        default: 50,
        max: 100,
      },
      multi: ['patch', 'remove'], // Allow multi-patch and multi-remove
    });

    this.sessionRepo = sessionRepo;
  }

  /**
   * Custom method: Fork a session
   *
   * Creates a new session branching from the current session at a decision point.
   */
  async fork(
    id: string,
    data: { prompt: string; task_id?: string },
    params?: SessionParams
  ): Promise<Session> {
    const parent = await this.get(id, params);

    const forkedSession = await this.create(
      {
        agent: parent.agent,
        status: 'idle',
        description: data.prompt,
        repo: parent.repo,
        git_state: { ...parent.git_state },
        genealogy: {
          forked_from_session_id: parent.session_id,
          // biome-ignore lint/suspicious/noExplicitAny: TaskID is branded UUID string
          fork_point_task_id: data.task_id as any,
          children: [],
        },
        concepts: [...(parent.concepts || [])],
        tasks: [],
        message_count: 0,
        tool_use_count: 0,
      },
      params
    );

    // Update parent's children list
    const parentChildren = parent.genealogy?.children || [];
    // Cast forkedSession to Session to handle return type
    const session = forkedSession as Session;
    await this.patch(
      id,
      {
        genealogy: {
          ...parent.genealogy,
          children: [...parentChildren, session.session_id],
        },
      },
      params
    );

    return session;
  }

  /**
   * Custom method: Spawn a child session
   *
   * Creates a new session for delegating a subtask to another agent.
   */
  async spawn(
    id: string,
    data: { prompt: string; agent?: Session['agent']; task_id?: string },
    params?: SessionParams
  ): Promise<Session> {
    const parent = await this.get(id, params);

    const spawnedSession = await this.create(
      {
        agent: data.agent || parent.agent,
        status: 'idle',
        description: data.prompt,
        repo: parent.repo,
        git_state: { ...parent.git_state },
        genealogy: {
          parent_session_id: parent.session_id,
          // biome-ignore lint/suspicious/noExplicitAny: TaskID is branded UUID string
          spawn_point_task_id: data.task_id as any,
          children: [],
        },
        concepts: [...(parent.concepts || [])],
        tasks: [],
        message_count: 0,
        tool_use_count: 0,
      },
      params
    );

    // Update parent's children list
    const parentChildren = parent.genealogy?.children || [];
    // Cast spawnedSession to Session to handle return type
    const session = spawnedSession as Session;
    await this.patch(
      id,
      {
        genealogy: {
          ...parent.genealogy,
          children: [...parentChildren, session.session_id],
        },
      },
      params
    );

    return session;
  }

  /**
   * Custom method: Get session genealogy tree
   *
   * Returns ancestors and descendants for visualization.
   */
  async getGenealogy(
    id: string,
    params?: SessionParams
  ): Promise<{
    session: Session;
    ancestors: Session[];
    children: Session[];
  }> {
    const session = await this.get(id, params);

    // Get ancestors
    const ancestors = await this.sessionRepo.findAncestors(id);

    // Get children
    const children = await this.sessionRepo.findChildren(id);

    return {
      session,
      ancestors,
      children,
    };
  }

  /**
   * Override find to support custom filtering
   */
  async find(params?: SessionParams): Promise<Paginated<Session> | Session[]> {
    // If filtering by status, use repository method (more efficient)
    if (params?.query?.status) {
      const sessions = await this.sessionRepo.findByStatus(params.query.status);

      // Apply pagination if enabled
      if (this.paginate) {
        const limit = params.query.$limit ?? this.paginate.default ?? 50;
        const skip = params.query.$skip ?? 0;

        return {
          total: sessions.length,
          limit,
          skip,
          data: sessions.slice(skip, skip + limit),
        };
      }

      return sessions;
    }

    // Otherwise use default find
    return super.find(params);
  }
}

/**
 * Service factory function
 */
export function createSessionsService(db: Database): SessionsService {
  return new SessionsService(db);
}
