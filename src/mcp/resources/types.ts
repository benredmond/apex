/**
 * Resource type definitions for APEX MCP server
 */

export type ResourceType = "file" | "pattern" | "brief";

/**
 * Base resource interface
 */
export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  description?: string;
  mimeType?: string;
  created: Date;
  updated: Date;
  metadata?: Record<string, unknown>;
}

/**
 * File resource - represents a code file or document
 */
export interface FileResource extends Resource {
  type: "file";
  content: string;
  path?: string;
  language?: string;
}

/**
 * Pattern resource - represents an APEX pattern
 */
export interface PatternResource extends Resource {
  type: "pattern";
  patternId: string; // e.g., "PAT:UI:COMPONENT"
  trustScore: number; // 1-5 stars
  usageCount: number;
  successRate: number;
  template?: string;
  context?: string;
}

/**
 * Brief resource - represents a task brief or specification
 */
export interface BriefResource extends Resource {
  type: "brief";
  taskId?: string;
  status: "draft" | "active" | "completed";
  content: string;
  acceptanceCriteria?: string[];
  estimate?: string;
}

/**
 * Type guards
 */
export function isFileResource(resource: Resource): resource is FileResource {
  return resource.type === "file";
}

export function isPatternResource(
  resource: Resource,
): resource is PatternResource {
  return resource.type === "pattern";
}

export function isBriefResource(resource: Resource): resource is BriefResource {
  return resource.type === "brief";
}

/**
 * Resource creation helpers
 */
export function createResource<T extends Resource>(
  type: ResourceType,
  id: string,
  name: string,
  additionalProps?: Partial<T>,
): T {
  const now = new Date();
  return {
    id,
    type,
    name,
    created: now,
    updated: now,
    ...additionalProps,
  } as T;
}
