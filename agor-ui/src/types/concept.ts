// src/types/concept.ts

/**
 * Path to a concept file relative to context/concepts/
 *
 * Examples:
 * - "core.md"
 * - "models.md"
 * - "architecture.md"
 * - "custom/auth-flow.md"
 */
export type ConceptPath = string;

export interface Concept {
  /**
   * File path relative to context/concepts/
   * This serves as the unique identifier for the concept.
   *
   * Examples: "core.md", "models.md", "custom/auth-flow.md"
   */
  path: ConceptPath;

  /** Human-readable name (extracted from filename or frontmatter) */
  name: string;

  /** Markdown content of the concept */
  content: string;

  /**
   * Related concept paths (from frontmatter "Related:" field)
   * Example: ["core.md", "models.md"]
   */
  related: ConceptPath[];

  /** Type of concept (derived from directory structure) */
  type: 'core' | 'exploration' | 'custom';

  /** File metadata */
  created_at: string;
  last_updated: string;
}
