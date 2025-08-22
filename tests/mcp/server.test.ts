const { describe, it, expect, jest, beforeEach, afterEach } = require("@jest/globals");
const Database = require("better-sqlite3");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");

// Mock the MCP SDK
jest.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    error: jest.fn(),
  })),
  StdioServerTransport: jest.fn(),
}));

describe("MCP Server Database Initialization", () => {
  let tempDir: string;
  let testDbPath: string;
  
  beforeEach(async () => {
    // Create temp directory for test databases
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-mcp-test-"));
    testDbPath = path.join(tempDir, "patterns.db");
    
    // Set environment variable to use test database
    process.env.APEX_PATTERNS_DB = testDbPath;
  });
  
  afterEach(async () => {
    // Clean up
    delete process.env.APEX_PATTERNS_DB;
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe("Database initialization", () => {
    it("should run AutoMigrator during initialization", async () => {
      // Import after mocks are set up
      const { ApexMcpServer } = await import("../../src/mcp/server.js");
      const { AutoMigrator } = await import("../../src/migrations/auto-migrator.js");
      
      // Spy on AutoMigrator
      const autoMigrateSpy = jest.spyOn(AutoMigrator.prototype, "autoMigrate");
      
      // Create server instance (initialization happens in constructor)
      const server = new ApexMcpServer();
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify AutoMigrator was called
      expect(autoMigrateSpy).toHaveBeenCalledWith({ silent: true });
      
      autoMigrateSpy.mockRestore();
    });

    it("should create all required tables including task_evidence", async () => {
      // Import and create server
      const { ApexMcpServer } = await import("../../src/mcp/server.js");
      const server = new ApexMcpServer();
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check database has all required tables
      const db = new Database(testDbPath, { readonly: true });
      
      try {
        // Get all table names
        const tables = db.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' 
          ORDER BY name
        `).all() as { name: string }[];
        
        const tableNames = tables.map(t => t.name);
        
        // Critical tables that must exist
        const requiredTables = [
          "patterns",
          "migrations",
          "pattern_drafts",
          "pattern_languages",
          "pattern_frameworks",
          "pattern_categories",
          "pattern_references",
          "pattern_conflicts",
          "pattern_relationships",
          "pattern_facets",
          "project_migrations",
          "tasks",
          "task_evidence",  // This was missing before!
        ];
        
        for (const table of requiredTables) {
          expect(tableNames).toContain(table);
        }
        
        // Specifically verify task_evidence table structure
        const taskEvidenceColumns = db.prepare(`
          PRAGMA table_info(task_evidence)
        `).all() as { name: string; type: string }[];
        
        const columnNames = taskEvidenceColumns.map(c => c.name);
        expect(columnNames).toContain("id");
        expect(columnNames).toContain("task_id");
        expect(columnNames).toContain("type");
        expect(columnNames).toContain("content");
        expect(columnNames).toContain("metadata");
        expect(columnNames).toContain("timestamp");
      } finally {
        db.close();
      }
    });

    it("should handle database connection properly without conflicts", async () => {
      const { ApexMcpServer } = await import("../../src/mcp/server.js");
      
      // Create server
      const server = new ApexMcpServer();
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Try to open database again (should not conflict)
      let db: Database.Database | null = null;
      expect(() => {
        db = new Database(testDbPath, { readonly: true });
      }).not.toThrow();
      
      if (db) {
        // Should be able to query
        const result = db.prepare("SELECT COUNT(*) as count FROM patterns").get() as { count: number };
        expect(result.count).toBeGreaterThanOrEqual(0);
        db.close();
      }
    });

    it("should create fresh database with all tables when database doesn't exist", async () => {
      // Ensure database doesn't exist
      if (await fs.pathExists(testDbPath)) {
        await fs.remove(testDbPath);
      }
      
      const { ApexMcpServer } = await import("../../src/mcp/server.js");
      const server = new ApexMcpServer();
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Database should now exist
      expect(await fs.pathExists(testDbPath)).toBe(true);
      
      // Check it has task_evidence table
      const db = new Database(testDbPath, { readonly: true });
      try {
        const result = db.prepare(`
          SELECT COUNT(*) as count 
          FROM sqlite_master 
          WHERE type='table' AND name='task_evidence'
        `).get() as { count: number };
        
        expect(result.count).toBe(1);
      } finally {
        db.close();
      }
    });

    it("should migrate existing database that lacks task_evidence table", async () => {
      // Create a database without task_evidence table (simulating old version)
      const db = new Database(testDbPath);
      
      // Create minimal patterns table
      db.exec(`
        CREATE TABLE patterns (
          id TEXT PRIMARY KEY,
          schema_version TEXT NOT NULL,
          pattern_version TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          trust_score REAL NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        
        CREATE TABLE migrations (
          id TEXT PRIMARY KEY,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
      `);
      
      // Verify task_evidence doesn't exist yet
      const tablesBefore = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='task_evidence'
      `).all();
      expect(tablesBefore).toHaveLength(0);
      
      db.close();
      
      // Now create MCP server which should run migrations
      const { ApexMcpServer } = await import("../../src/mcp/server.js");
      const server = new ApexMcpServer();
      
      // Wait for migrations to run
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Check task_evidence table now exists
      const dbAfter = new Database(testDbPath, { readonly: true });
      try {
        const tablesAfter = dbAfter.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='task_evidence'
        `).all();
        expect(tablesAfter).toHaveLength(1);
        
        // Verify we can query it
        const result = dbAfter.prepare("SELECT COUNT(*) as count FROM task_evidence").get() as { count: number };
        expect(result.count).toBe(0);
      } finally {
        dbAfter.close();
      }
    });
  });

  describe("Error handling", () => {
    it("should handle AutoMigrator errors gracefully", async () => {
      // Make database path invalid to trigger error
      process.env.APEX_PATTERNS_DB = "/invalid/path/that/does/not/exist/patterns.db";
      
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      
      const { ApexMcpServer } = await import("../../src/mcp/server.js");
      
      // Should not throw, but should log error
      expect(() => new ApexMcpServer()).not.toThrow();
      
      // Wait a bit for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have logged an error
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it("should handle database permission errors", async () => {
      // Create read-only directory to trigger permission error
      const readOnlyDir = path.join(tempDir, "readonly");
      await fs.ensureDir(readOnlyDir);
      await fs.chmod(readOnlyDir, 0o444); // Read-only
      
      process.env.APEX_PATTERNS_DB = path.join(readOnlyDir, "patterns.db");
      
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      
      const { ApexMcpServer } = await import("../../src/mcp/server.js");
      
      // Should handle error gracefully
      expect(() => new ApexMcpServer()).not.toThrow();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Restore permissions for cleanup
      await fs.chmod(readOnlyDir, 0o755);
      
      consoleSpy.mockRestore();
    });
  });
});