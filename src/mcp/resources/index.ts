/**
 * Resource Manager for APEX MCP Server
 * Handles in-memory storage and CRUD operations for resources
 */

import { 
  Resource, 
  ResourceType, 
  FileResource, 
  PatternResource, 
  BriefResource,
  createResource,
  isFileResource,
  isPatternResource,
  isBriefResource
} from './types.js';
import { ResourceNotFoundError, InvalidResourceTypeError } from '../errors.js';

export class ResourceManager {
  private resources: Map<string, Resource> = new Map();
  
  /**
   * Create a new resource
   */
  create<T extends Resource>(
    type: ResourceType,
    id: string,
    name: string,
    additionalProps?: Partial<T>
  ): T {
    if (this.resources.has(id)) {
      throw new Error(`Resource with id ${id} already exists`);
    }
    
    const resource = createResource<T>(type, id, name, additionalProps);
    this.resources.set(id, resource);
    return resource;
  }
  
  /**
   * Get a resource by ID
   */
  get(id: string): Resource {
    const resource = this.resources.get(id);
    if (!resource) {
      throw new ResourceNotFoundError(id);
    }
    return resource;
  }
  
  /**
   * Update a resource
   */
  update(id: string, updates: Partial<Resource>): Resource {
    const resource = this.get(id);
    
    // Don't allow changing core properties
    const { id: _, type: __, created: ___, ...allowedUpdates } = updates;
    
    const updatedResource = {
      ...resource,
      ...allowedUpdates,
      updated: new Date(),
    };
    
    this.resources.set(id, updatedResource);
    return updatedResource;
  }
  
  /**
   * Delete a resource
   */
  delete(id: string): void {
    if (!this.resources.has(id)) {
      throw new ResourceNotFoundError(id);
    }
    this.resources.delete(id);
  }
  
  /**
   * List all resources, optionally filtered by type
   */
  list(type?: ResourceType): Resource[] {
    const resources = Array.from(this.resources.values());
    
    if (type) {
      return resources.filter(r => r.type === type);
    }
    
    return resources;
  }
  
  /**
   * Clear all resources
   */
  clear(): void {
    this.resources.clear();
  }
  
  /**
   * Get resource count
   */
  get size(): number {
    return this.resources.size;
  }
  
  /**
   * Type-safe getters for specific resource types
   */
  getFile(id: string): FileResource {
    const resource = this.get(id);
    if (!isFileResource(resource)) {
      throw new InvalidResourceTypeError(`Expected file resource, got ${resource.type}`);
    }
    return resource;
  }
  
  getPattern(id: string): PatternResource {
    const resource = this.get(id);
    if (!isPatternResource(resource)) {
      throw new InvalidResourceTypeError(`Expected pattern resource, got ${resource.type}`);
    }
    return resource;
  }
  
  getBrief(id: string): BriefResource {
    const resource = this.get(id);
    if (!isBriefResource(resource)) {
      throw new InvalidResourceTypeError(`Expected brief resource, got ${resource.type}`);
    }
    return resource;
  }
  
  /**
   * Create convenience methods
   */
  createFile(id: string, name: string, content: string, additionalProps?: Partial<FileResource>): FileResource {
    return this.create<FileResource>('file', id, name, {
      content,
      ...additionalProps,
    });
  }
  
  createPattern(
    id: string, 
    name: string, 
    patternId: string,
    additionalProps?: Partial<PatternResource>
  ): PatternResource {
    return this.create<PatternResource>('pattern', id, name, {
      patternId,
      trustScore: 3,
      usageCount: 0,
      successRate: 0,
      ...additionalProps,
    });
  }
  
  createBrief(
    id: string,
    name: string,
    content: string,
    additionalProps?: Partial<BriefResource>
  ): BriefResource {
    return this.create<BriefResource>('brief', id, name, {
      content,
      status: 'draft',
      ...additionalProps,
    });
  }
}

// Export types for convenience
export * from './types.js';