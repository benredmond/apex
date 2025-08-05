// [FIX:ASYNC:ERROR] ★★★★★ (234 uses, 98% success) - Proper async error handling
// [PAT:BUILD:MODULE:ESM] ★★★☆☆ (3 uses, 100% success) - ES modules with .js extensions

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import chalk from "chalk";
import { z } from "zod";

export interface MCPClientOptions {
  timeout?: number; // Default: 1000ms for sub-second requirement
  retries?: number; // Default: 3
  serverPath?: string; // Path to MCP server executable
  debug?: boolean; // Enable debug logging
}

export interface MCPResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Lightweight MCP client for CLI operations
 * Implements connection pooling, retry logic, and timeout handling
 */
export class MCPClient {
  private client?: Client;
  private connecting?: Promise<void>;
  private transport?: StdioClientTransport;
  private options: Required<MCPClientOptions>;
  private serverProcess?: any;

  constructor(options: MCPClientOptions = {}) {
    this.options = {
      timeout: options.timeout ?? 1000,
      retries: options.retries ?? 3,
      serverPath: options.serverPath ?? "node src/mcp/index.js",
      debug: options.debug ?? false,
    };
  }

  /**
   * Lazy connection with pooling
   */
  async connect(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.establishConnection();
    await this.connecting;
  }

  /**
   * Establish connection to MCP server
   */
  private async establishConnection(): Promise<void> {
    try {
      if (this.options.debug) {
        console.error(chalk.gray("Connecting to MCP server..."));
      }

      // Spawn the MCP server process
      const [command, ...args] = this.options.serverPath.split(" ");
      this.serverProcess = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          APEX_PATTERNS_DB: process.env.APEX_PATTERNS_DB || "patterns.db",
        },
      });

      // Create stdio transport
      this.transport = new StdioClientTransport({
        command: command,
        args: args,
      });

      // Initialize client
      this.client = new Client(
        {
          name: "apex-cli",
          version: "0.1.0",
        },
        {
          capabilities: {},
        },
      );

      // Connect to server
      await this.client.connect(this.transport);

      if (this.options.debug) {
        console.error(chalk.gray("Connected to MCP server"));
      }
    } catch (error) {
      this.connecting = undefined;
      throw new Error(`Failed to connect to MCP server: ${error}`);
    }
  }

  /**
   * Execute MCP call with timeout and retry logic
   */
  async call<T = any>(
    method: string,
    params: any = {},
  ): Promise<MCPResponse<T>> {
    try {
      await this.connect();
      const result = await this.executeWithRetry<T>(method, params);
      return { success: true, data: result };
    } catch (error) {
      if (this.options.debug) {
        console.error(chalk.red(`MCP call failed: ${error}`));
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute with exponential backoff retry
   */
  private async executeWithRetry<T>(method: string, params: any): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < this.options.retries; i++) {
      try {
        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("Request timeout")),
            this.options.timeout,
          );
        });

        // Race between actual request and timeout
        const result = await Promise.race([
          this.makeRequest<T>(method, params),
          timeoutPromise,
        ]);

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on the last attempt
        if (i === this.options.retries - 1) break;

        // Exponential backoff: 100ms, 200ms, 400ms...
        const delay = Math.pow(2, i) * 100;
        if (this.options.debug) {
          console.error(
            chalk.gray(
              `Retrying in ${delay}ms... (attempt ${i + 2}/${this.options.retries})`,
            ),
          );
        }
        await this.delay(delay);
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  /**
   * Make the actual MCP request
   */
  private async makeRequest<T>(method: string, params: any): Promise<T> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    // Map CLI methods to MCP tool names
    const toolMapping: Record<string, string> = {
      listPatterns: "apex_patterns_lookup",
      analyzePatterns: "apex_patterns_discover",
      validatePattern: "apex_patterns_explain",
      promotePattern: "apex_reflect",
      getStatistics: "apex_patterns_lookup",
      // Brief commands would map to future MCP tools
      createBrief: "apex_brief_create",
      showBrief: "apex_brief_show",
      ackBrief: "apex_brief_ack",
      // Pack commands
      listPacks: "apex_pack_list",
      installPack: "apex_pack_install",
      createPack: "apex_pack_create",
    };

    const mcpTool = toolMapping[method] || method;

    // Call the MCP tool - use generic result schema
    const resultSchema = z.object({}).passthrough(); // Allow any properties
    const response = await this.client.request(
      {
        method: "tools/call",
        params: {
          name: mcpTool,
          arguments: params,
        },
      },
      resultSchema,
    );

    return response as T;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = undefined;
    }

    if (this.transport) {
      await this.transport.close();
      this.transport = undefined;
    }

    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = undefined;
    }

    this.connecting = undefined;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return !!this.client;
  }
}

/**
 * Singleton instance for CLI commands
 */
let sharedClient: MCPClient | undefined;

/**
 * Get or create shared MCP client instance
 */
export function getSharedMCPClient(options?: MCPClientOptions): MCPClient {
  if (!sharedClient) {
    sharedClient = new MCPClient(options);
  }
  return sharedClient;
}

/**
 * Clean up shared client on process exit
 */
process.on("exit", async () => {
  if (sharedClient) {
    await sharedClient.disconnect();
  }
});

process.on("SIGINT", async () => {
  if (sharedClient) {
    await sharedClient.disconnect();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (sharedClient) {
    await sharedClient.disconnect();
  }
  process.exit(0);
});
