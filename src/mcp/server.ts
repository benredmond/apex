/**
 * APEX MCP Server
 * Main server implementation for Model Context Protocol
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  ServerCapabilities,
} from "@modelcontextprotocol/sdk/types.js";
import { ResourceManager } from "./resources/index.js";
import { registerTools, getToolsList, initializeTools } from "./tools/index.js";
import { ApexStdioTransport } from "./transports/stdio.js";
import { toMCPError } from "./errors.js";
import { PatternRepository } from "../storage/repository.js";
import { PatternDatabase } from "../storage/database.js";
import {
  getMetricsResource,
  readMetricsResource,
} from "./resources/metrics.js";

export interface ApexMCPServerOptions {
  name?: string;
  version?: string;
  capabilities?: ServerCapabilities;
}

export class ApexMCPServer {
  private server: Server;
  private resourceManager: ResourceManager;
  private transport?: ApexStdioTransport;
  private repository?: PatternRepository;

  constructor(options: ApexMCPServerOptions = {}) {
    const {
      name = "apex-mcp-server",
      version = "0.1.0",
      capabilities = {},
    } = options;

    // Initialize the SDK server
    this.server = new Server(
      {
        name,
        version,
      },
      {
        capabilities: {
          resources: {},
          tools: {},
          ...capabilities,
        },
      },
    );

    // Initialize resource manager
    this.resourceManager = new ResourceManager();

    // Set up handlers
    this.setupHandlers();
  }

  /**
   * Initialize the pattern storage system
   */
  private async initializePatternSystem(): Promise<void> {
    try {
      // Import required modules
      const { ApexConfig } = await import("../config/apex-config.js");
      const { AutoMigrator } = await import("../migrations/auto-migrator.js");

      // Try to migrate legacy database if needed
      const migrated = await ApexConfig.migrateLegacyDatabase();
      if (migrated && process.env.APEX_DEBUG) {
        console.error(
          `[APEX MCP] Migrated legacy database to project-specific location`,
        );
      }

      // Get database path for migrations
      const dbPath = await ApexConfig.getProjectDbPath();
      
      // Run migrations to ensure all tables exist (including task_evidence)
      const migrator = new AutoMigrator(dbPath);
      await migrator.autoMigrate({ silent: true });

      // Log current working directory for debugging (only if debug env var is set)
      if (process.env.APEX_DEBUG) {
        const globalDbPath = await ApexConfig.getGlobalDbPath();
        console.error(`[APEX MCP] Current directory: ${process.cwd()}`);
        console.error(`[APEX MCP] Using project database: ${dbPath}`);
        console.error(`[APEX MCP] Using global fallback: ${globalDbPath}`);
      }

      // Create repository with project-specific paths
      // This factory method handles all path resolution and fallback setup
      this.repository = await PatternRepository.createWithProjectPaths({
        enableFallback: true,
      });

      // Initialize the repository (loads patterns)
      await this.repository.initialize();
      // console.error(`[APEX MCP] Repository initialized`);

      // Get the database instance
      const sharedDb = this.repository.getDatabase();

      // Run migrations to ensure all tables exist (including tasks)
      try {
        const { MigrationRunner } = await import(
          "../migrations/MigrationRunner.js"
        );
        const { MigrationLoader } = await import(
          "../migrations/MigrationLoader.js"
        );

        const runner = new MigrationRunner(sharedDb);
        const loader = new MigrationLoader();
        const migrations = await loader.loadMigrations();

        // Run any pending migrations
        await runner.runMigrations(migrations);
        if (process.env.APEX_DEBUG) {
          console.error(`[APEX MCP] Database migrations completed`);
        }
      } catch (migrationError) {
        console.error(
          `[APEX MCP] Warning: Failed to run migrations:`,
          migrationError,
        );
        // Continue anyway - some features may not work
      }

      // Initialize tools with repository and shared database instance
      await initializeTools(this.repository, sharedDb);
      // console.error(`[APEX MCP] Tools initialized`);
    } catch (error) {
      // Re-throw the error so it can be properly handled
      // The silent failure was causing the "Task service not initialized" error
      throw new Error(
        `Failed to initialize pattern system: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Set up request handlers for the server
   */
  private setupHandlers(): void {
    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const resources = this.resourceManager.list();

        // Add static resources like metrics
        const metricsResource = getMetricsResource();

        return {
          resources: [
            ...resources.map((r) => ({
              uri: `apex://resource/${r.id}`,
              name: r.name,
              description: r.description,
              mimeType: r.mimeType,
            })),
            {
              uri: metricsResource.uri,
              name: metricsResource.name,
              description: metricsResource.description,
              mimeType: metricsResource.mimeType,
            },
          ],
        };
      } catch (error) {
        throw toMCPError(error);
      }
    });

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        try {
          const { uri } = request.params;

          // Handle metrics resource specially
          if (uri === "apex://metrics/lookup") {
            const content = await readMetricsResource(uri);
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: content,
                },
              ],
            };
          }

          // Extract resource ID from URI
          const match = uri.match(/^apex:\/\/resource\/(.+)$/);
          if (!match) {
            throw new Error(`Invalid resource URI: ${uri}`);
          }

          const resourceId = match[1];
          const resource = this.resourceManager.get(resourceId);

          // Convert resource to content
          let content = "";
          if ("content" in resource) {
            content = (resource as any).content;
          } else {
            content = JSON.stringify(resource, null, 2);
          }

          return {
            contents: [
              {
                uri,
                mimeType: resource.mimeType || "application/json",
                text: content,
              },
            ],
          };
        } catch (error) {
          throw toMCPError(error);
        }
      },
    );

    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        return {
          tools: getToolsList(),
        };
      } catch (error) {
        throw toMCPError(error);
      }
    });
  }

  /**
   * Start the server with stdio transport
   */
  async startStdio(): Promise<void> {
    try {
      // Initialize pattern system before starting
      await this.initializePatternSystem();
    } catch (error) {
      // Log error to stderr for debugging
      console.error(
        "[APEX MCP] CRITICAL: Pattern system initialization failed:",
        error,
      );
      console.error("[APEX MCP] Stack trace:", (error as Error).stack);

      // Exit the process immediately to prevent zombie servers
      console.error("[APEX MCP] Exiting due to initialization failure");
      process.exit(1);
    }

    // Register tool implementations after initialization
    try {
      await registerTools(this.server);
      // console.error("[APEX MCP] Tools registered successfully");
    } catch (error) {
      console.error("[APEX MCP] Failed to register tools:", error);
      throw error;
    }

    this.transport = new ApexStdioTransport();
    await this.transport.connect(this.server);
    await this.transport.start();

    // console.error("[APEX MCP] Server started with stdio transport");
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }
    // console.error("[APEX MCP] Server stopped");
  }

  /**
   * Get the resource manager
   */
  get resources(): ResourceManager {
    return this.resourceManager;
  }

  /**
   * Get the underlying SDK server instance
   */
  get sdkServer(): Server {
    return this.server;
  }
}
