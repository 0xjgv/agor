// src/types/repo.ts
import type { UUID, SessionID } from './id';

/**
 * URL-friendly identifier for repositories and worktrees
 *
 * Used for:
 * - Repository slugs (e.g., "myapp", "backend-api")
 * - Worktree names (e.g., "feat-auth", "fix-cors")
 * - Directory names in ~/.agor/repos/ and ~/.agor/worktrees/
 *
 * Format: lowercase, alphanumeric, hyphens only
 *
 * Examples: "myapp", "backend", "feat-auth-middleware"
 */
export type RepoSlug = string;

/**
 * Worktree name (slug-formatted)
 *
 * Becomes both the directory name and (optionally) the branch name.
 */
export type WorktreeName = string;

/**
 * Git repository managed by Agor
 *
 * Repositories can be:
 * 1. Agor-managed: Cloned as bare repo to ~/.agor/repos/{slug}
 * 2. User-managed: External repo that sessions reference
 *
 * Agor-managed repos enable worktree creation and parallel development.
 */
export interface Repo {
  /** Unique repository identifier (UUIDv7) */
  repo_id: UUID;

  /**
   * URL-friendly slug for the repository
   *
   * Used for:
   * - Directory name: ~/.agor/repos/{slug}
   * - CLI references: agor repo show {slug}
   * - Worktree organization
   *
   * Must be unique across all repos.
   */
  slug: RepoSlug;

  /**
   * Human-readable name
   *
   * Defaults to slug but can be customized.
   */
  name: string;

  /**
   * Git remote URL (if cloned by Agor)
   *
   * Examples:
   * - "https://github.com/user/repo.git"
   * - "git@github.com:user/repo.git"
   *
   * Undefined for user-managed repos without remotes.
   */
  remote_url?: string;

  /**
   * Local path to repository
   *
   * For Agor-managed repos: ~/.agor/repos/{slug} (bare clone)
   * For user-managed repos: User's existing repo path
   */
  local_path: string;

  /**
   * Whether Agor manages this repository
   *
   * true:  Cloned by Agor, supports worktree management
   * false: User's existing repo, Agor only tracks sessions
   */
  managed_by_agor: boolean;

  /**
   * Active worktrees for this repository
   *
   * Only populated for Agor-managed repos.
   * Empty array for user-managed repos.
   */
  worktrees: WorktreeConfig[];

  /**
   * Default branch name
   *
   * Detected from remote or HEAD.
   * Used when creating new worktrees without explicit ref.
   */
  default_branch?: string;

  /** Repository metadata */
  created_at: string;
  last_updated: string;
}

/**
 * Git worktree configuration
 *
 * Worktrees are working directories for specific branches,
 * allowing multiple branches to be checked out simultaneously.
 *
 * Structure: ~/.agor/worktrees/{repo-slug}/{name}/
 */
export interface WorktreeConfig {
  /**
   * Worktree name (slug format)
   *
   * Used for:
   * - Directory name: ~/.agor/worktrees/{repo-slug}/{name}
   * - Default branch name (if creating new branch)
   * - CLI references
   *
   * Examples: "main", "feat-auth", "exp-rewrite"
   */
  name: WorktreeName;

  /**
   * Absolute path to worktree directory
   *
   * Example: "/Users/max/.agor/worktrees/myapp/feat-auth"
   */
  path: string;

  /**
   * Git ref (branch/tag/commit) checked out in this worktree
   *
   * Examples: "feat-auth", "main", "v1.2.3", "a1b2c3d"
   */
  ref: string;

  /**
   * Whether this ref is a new branch created by Agor
   *
   * true:  Branch was created during worktree creation
   * false: Branch existed before (tracked from remote or local)
   */
  new_branch: boolean;

  /**
   * Remote tracking branch (if any)
   *
   * Examples: "origin/feat-auth", "upstream/main"
   */
  tracking_branch?: string;

  /**
   * Sessions using this worktree
   *
   * Multiple sessions can share a worktree (same working directory).
   * Useful for:
   * - Continuing work across sessions
   * - Fork/spawn relationships on same branch
   */
  sessions: SessionID[];

  /**
   * Last git commit SHA in this worktree
   *
   * Updated when sessions complete tasks.
   */
  last_commit_sha?: string;

  /** Worktree metadata */
  created_at: string;
  last_used: string;
}

/**
 * Session's repository context
 *
 * Links a session to either:
 * 1. Agor-managed repo + worktree
 * 2. User's existing directory (with optional git repo)
 */
export interface SessionRepoContext {
  /**
   * Repository ID (if Agor-managed)
   *
   * Undefined for sessions in user-managed directories.
   */
  repo_id?: UUID;

  /**
   * Repository slug (if Agor-managed)
   *
   * Enables quick CLI references without UUID lookup.
   */
  repo_slug?: RepoSlug;

  /**
   * Worktree name (if using Agor-managed worktree)
   *
   * Undefined if session uses user's directory.
   */
  worktree_name?: WorktreeName;

  /**
   * Working directory (absolute path)
   *
   * For Agor-managed: ~/.agor/worktrees/{repo-slug}/{worktree-name}
   * For user-managed: User's current working directory
   *
   * This is where the agent CLI executes.
   */
  cwd: string;

  /**
   * Whether this session uses Agor-managed worktree
   *
   * true:  Session in ~/.agor/worktrees/
   * false: Session in user's directory
   */
  managed_worktree: boolean;
}
