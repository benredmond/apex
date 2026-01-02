/**
 * APEX MCP Server Entry Point
 * Main module exports and server initialization
 */

export { ApexMCPServer } from "./server.js";
export type { ApexMCPServerOptions } from "./server.js";
export { ResourceManager } from "./resources/index.js";
export * from "./resources/types.js";
export * from "./errors.js";

// Re-export useful types from SDK
export type {
  Tool,
  Resource as MCPResource,
  ServerCapabilities,
} from "@modelcontextprotocol/sdk/types.js";

function redirectStdoutLogsToStderr(): void {
  const redirect =
    (fn: (...args: any[]) => void) =>
    (...args: any[]) =>
      fn(...args);

  console.log = redirect(console.error);
  console.info = redirect(console.error);
  console.debug = redirect(console.error);
}

/**
 * Create and start a stdio MCP server
 * This is the main entry point for running the server
 */
export async function startMCPServer(): Promise<void> {
  redirectStdoutLogsToStderr();
  const { ApexMCPServer } = await import("./server.js");

  const server = new ApexMCPServer({
    name: "apex-mcp-server",
    version: "0.1.0",
  });

  // Handle shutdown gracefully
  process.on("SIGINT", async () => {
    // console.error("\n[APEX MCP] Shutting down...");
    await server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    // console.error("[APEX MCP] Shutting down...");
    await server.stop();
    process.exit(0);
  });

  // Start the server
  try {
    await server.startStdio();
  } catch (error) {
    // console.error("[APEX MCP] Failed to start server:", error);
    process.exit(1);
  }
}

// If this module is run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  startMCPServer().catch((error) => {
    // console.error("[APEX MCP] Fatal error:", error);
    process.exit(1);
  });
}
