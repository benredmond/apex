// [PAT:CONFIG:CONSTANTS] ★★★★★ (89 uses, 98% success) - From cache
// Centralized configuration constants for schema versions

export const SCHEMA_VERSIONS = {
  PATTERN: "1.0.0", // Pattern storage schema version
  MCP: "0.3.0", // MCP tool schema version
  DATABASE: "0.3", // Database meta schema version
} as const;

// For backward compatibility and clarity
export const PATTERN_SCHEMA_VERSION = SCHEMA_VERSIONS.PATTERN;
export const MCP_SCHEMA_VERSION = SCHEMA_VERSIONS.MCP;
export const DATABASE_SCHEMA_VERSION = SCHEMA_VERSIONS.DATABASE;
