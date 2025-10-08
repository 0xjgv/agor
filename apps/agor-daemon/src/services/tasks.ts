/**
 * Tasks Service
 *
 * Provides REST + WebSocket API for task management.
 * Uses DrizzleService adapter with TaskRepository.
 */

import { type Database, TaskRepository } from '@agor/core/db';
import type { Task } from '@agor/core/types';
import type { Params } from '@feathersjs/feathers';
import { DrizzleService } from '../adapters/drizzle';

/**
 * Task service params
 */
export interface TaskParams extends Params {
  query?: {
    session_id?: string;
    status?: Task['status'];
    $limit?: number;
    $skip?: number;
    $sort?: Record<string, 1 | -1>;
    $select?: string[];
  };
}

/**
 * Extended tasks service with custom methods
 */
export class TasksService extends DrizzleService<Task, Partial<Task>, TaskParams> {
  private taskRepo: TaskRepository;

  constructor(db: Database) {
    const taskRepo = new TaskRepository(db);
    super(taskRepo, {
      id: 'task_id',
      paginate: {
        default: 100,
        max: 500,
      },
      multi: ['patch', 'remove'],
    });

    this.taskRepo = taskRepo;
  }

  /**
   * Override find to support session-based filtering
   */
  // biome-ignore lint/suspicious/noExplicitAny: Returns Paginated<Task> or Task[] depending on pagination
  async find(params?: TaskParams): Promise<any> {
    // If filtering by session_id, use repository method
    if (params?.query?.session_id) {
      const tasks = await this.taskRepo.findBySession(params.query.session_id);

      // Apply pagination if enabled
      if (this.paginate) {
        const limit = params.query.$limit ?? this.paginate.default ?? 100;
        const skip = params.query.$skip ?? 0;

        return {
          total: tasks.length,
          limit,
          skip,
          data: tasks.slice(skip, skip + limit),
        };
      }

      return tasks;
    }

    // If filtering by status
    if (params?.query?.status === 'running') {
      const tasks = await this.taskRepo.findRunning();

      if (this.paginate) {
        const limit = params.query.$limit ?? this.paginate.default ?? 100;
        const skip = params.query.$skip ?? 0;

        return {
          total: tasks.length,
          limit,
          skip,
          data: tasks.slice(skip, skip + limit),
        };
      }

      return tasks;
    }

    // Otherwise use default find
    return super.find(params);
  }

  /**
   * Custom method: Get running tasks across all sessions
   */
  async getRunning(_params?: TaskParams): Promise<Task[]> {
    return this.taskRepo.findRunning();
  }

  /**
   * Custom method: Bulk create tasks (for imports)
   */
  async createMany(taskList: Partial<Task>[]): Promise<Task[]> {
    return this.taskRepo.createMany(taskList);
  }

  /**
   * Custom method: Complete a task
   */
  async complete(
    id: string,
    data: { report?: Task['report'] },
    params?: TaskParams
  ): Promise<Task> {
    return this.patch(
      id,
      {
        status: 'completed',
        completed_at: new Date().toISOString(),
        report: data.report,
      },
      params
    ) as Promise<Task>;
  }

  /**
   * Custom method: Fail a task
   */
  async fail(id: string, _data: { error?: string }, params?: TaskParams): Promise<Task> {
    return this.patch(
      id,
      {
        status: 'failed',
        completed_at: new Date().toISOString(),
        // Don't set report for failed tasks - error info should be in task description
      },
      params
    ) as Promise<Task>;
  }
}

/**
 * Service factory function
 */
export function createTasksService(db: Database): TasksService {
  return new TasksService(db);
}
