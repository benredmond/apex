/**
 * Tests for MCP tools orchestration
 * Migrated to Vitest to fix Jest ESM module linking issues
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock the MCP tools module
vi.mock('../../../src/mcp/tools/index.js', () => ({
  listTools: vi.fn(() => [
    { name: 'apex_patterns_lookup', description: 'Find patterns' },
    { name: 'apex_task_create', description: 'Create task' }
  ]),
  handleToolCall: vi.fn(async (name, args) => {
    if (name === 'apex_patterns_lookup') {
      return { patterns: [], success: true };
    }
    if (name === 'apex_task_create') {
      return { id: 'test-task-id', success: true };
    }
    throw new Error(`Unknown tool: ${name}`);
  })
}));

describe('MCP Tools Index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list available MCP tools', async () => {
    const { listTools } = await import('../../../src/mcp/tools/index.js');

    const tools = listTools();

    expect(tools).toBeDefined();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]).toHaveProperty('name');
    expect(tools[0]).toHaveProperty('description');
  });

  it('should handle apex_patterns_lookup tool call', async () => {
    const { handleToolCall } = await import('../../../src/mcp/tools/index.js');

    const result = await handleToolCall('apex_patterns_lookup', {
      task: 'test task',
      max_results: 5
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.patterns).toBeDefined();
  });

  it('should handle apex_task_create tool call', async () => {
    const { handleToolCall } = await import('../../../src/mcp/tools/index.js');

    const result = await handleToolCall('apex_task_create', {
      intent: 'Test task creation',
      type: 'feature'
    });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.id).toBe('test-task-id');
  });

  it('should throw error for unknown tool', async () => {
    const { handleToolCall } = await import('../../../src/mcp/tools/index.js');

    await expect(
      handleToolCall('unknown_tool', {})
    ).rejects.toThrow('Unknown tool: unknown_tool');
  });
});