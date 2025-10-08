/**
 * Repos Service
 *
 * Provides REST + WebSocket API for repository management.
 * Uses DrizzleService adapter with RepoRepository.
 */

import { type Database, RepoRepository } from '@agor/core/db';
import { cloneRepo, getWorktreePath, createWorktree as gitCreateWorktree } from '@agor/core/git';
import type { Repo } from '@agor/core/types';
import type { Params } from '@feathersjs/feathers';
import { DrizzleService } from '../adapters/drizzle';

/**
 * Repo service params
 */
export interface RepoParams extends Params {
  query?: {
    slug?: string;
    managed_by_agor?: boolean;
    $limit?: number;
    $skip?: number;
    $sort?: Record<string, 1 | -1>;
    $select?: string[];
  };
}

/**
 * Extended repos service with custom methods
 */
export class ReposService extends DrizzleService<Repo, Partial<Repo>, RepoParams> {
  private repoRepo: RepoRepository;

  constructor(db: Database) {
    const repoRepo = new RepoRepository(db);
    super(repoRepo, {
      id: 'repo_id',
      paginate: {
        default: 50,
        max: 100,
      },
    });

    this.repoRepo = repoRepo;
  }

  /**
   * Custom method: Find repo by slug
   */
  async findBySlug(slug: string, _params?: RepoParams): Promise<Repo | null> {
    return this.repoRepo.findBySlug(slug);
  }

  /**
   * Custom method: Add worktree to repo
   */
  async addWorktree(
    id: string,
    worktree: { name: string; path: string; branch?: string },
    params?: RepoParams
  ): Promise<Repo> {
    const repo = await this.get(id, params);
    const worktrees = repo.worktrees || [];

    // Avoid duplicates
    if (worktrees.some(wt => wt.name === worktree.name)) {
      throw new Error(`Worktree '${worktree.name}' already exists`);
    }

    return this.patch(
      id,
      {
        worktrees: [
          ...worktrees,
          {
            name: worktree.name,
            path: worktree.path,
            ref: worktree.branch || 'main',
            new_branch: false, // Will be updated by createWorktree if needed
            sessions: [],
            created_at: new Date().toISOString(),
            last_used: new Date().toISOString(),
          },
        ],
      },
      params
    ) as Promise<Repo>;
  }

  /**
   * Custom method: Remove worktree from repo
   */
  async removeWorktree(id: string, worktreeName: string, params?: RepoParams): Promise<Repo> {
    const repo = await this.get(id, params);
    const worktrees = repo.worktrees || [];

    return this.patch(
      id,
      {
        worktrees: worktrees.filter(wt => wt.name !== worktreeName),
      },
      params
    ) as Promise<Repo>;
  }

  /**
   * Custom method: Clone repository
   */
  async cloneRepository(data: { url: string; slug: string }, params?: RepoParams): Promise<Repo> {
    // Check if repo with this slug already exists in database
    const existing = await this.repoRepo.findBySlug(data.slug);
    if (existing) {
      throw new Error(`Repository '${data.slug}' already exists in database`);
    }

    // Clone using git-utils
    const result = await cloneRepo({ url: data.url });

    // Create database record
    return this.create(
      {
        slug: data.slug,
        name: result.repoName,
        remote_url: data.url,
        local_path: result.path,
        managed_by_agor: true,
        default_branch: result.defaultBranch,
        worktrees: [],
      },
      params
    ) as Promise<Repo>;
  }

  /**
   * Custom method: Create worktree
   */
  async createWorktree(
    id: string,
    data: { name: string; ref: string; createBranch?: boolean },
    params?: RepoParams
  ): Promise<Repo> {
    const repo = await this.get(id, params);

    // Generate worktree path
    const worktreePath = getWorktreePath(repo.slug, data.name);

    // Create git worktree
    await gitCreateWorktree(repo.local_path, worktreePath, data.ref, data.createBranch);

    // Get current worktrees and add new one with proper new_branch flag
    const worktrees = repo.worktrees || [];
    return this.patch(
      id,
      {
        worktrees: [
          ...worktrees,
          {
            name: data.name,
            path: worktreePath,
            ref: data.ref,
            new_branch: data.createBranch ?? false,
            sessions: [],
            created_at: new Date().toISOString(),
            last_used: new Date().toISOString(),
          },
        ],
      },
      params
    ) as Promise<Repo>;
  }
}

/**
 * Service factory function
 */
export function createReposService(db: Database): ReposService {
  return new ReposService(db);
}
