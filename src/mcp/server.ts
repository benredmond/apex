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

    // Initialize pattern repository
    this.initializePatternSystem();

    // Set up handlers
    this.setupHandlers();
  }

  /**
   * Initialize the pattern storage system
   */
  private initializePatternSystem(): void {
    try {
      // Initialize database with in-memory storage for now
      const database = new PatternDatabase(":memory:");

      // Create repository
      this.repository = new PatternRepository({ dbPath: ":memory:" });

      // Initialize tools with repository
      initializeTools(this.repository);
    } catch (error) {
      console.error("[APEX MCP] Failed to initialize pattern system:", error);
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
        return {
          resources: resources.map((r) => ({
            uri: `apex://resource/${r.id}`,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          })),
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

    // Register tool implementations
    registerTools(this.server).catch((error) => {
      console.error("[APEX MCP] Failed to register tools:", error);
    });
  }

  /**
   * Start the server with stdio transport
   */
  async startStdio(): Promise<void> {
    this.transport = new ApexStdioTransport();
    await this.transport.connect(this.server);
    await this.transport.start();

    console.error("[APEX MCP] Server started with stdio transport");
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }
    console.error("[APEX MCP] Server stopped");
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
