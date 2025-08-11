/**
 * Stdio Transport for APEX MCP Server
 * Handles JSON-RPC communication over stdin/stdout
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export class ApexStdioTransport {
  private transport: StdioServerTransport;

  constructor() {
    this.transport = new StdioServerTransport();
  }

  /**
   * Connect the transport to an MCP server
   */
  async connect(server: Server): Promise<void> {
    await server.connect(this.transport);

    // Handle errors
    this.transport.onerror = (error) => {
      // console.error("[APEX MCP] Transport error:", error);
    };

    // Handle close
    this.transport.onclose = () => {
      // console.error("[APEX MCP] Transport closed");
      process.exit(0);
    };
  }

  /**
   * Start the transport
   */
  async start(): Promise<void> {
    // The stdio transport starts automatically when connected
    // console.error("[APEX MCP] Stdio transport started");
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    await this.transport.close();
  }
}
