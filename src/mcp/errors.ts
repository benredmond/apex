/**
 * MCP Protocol Error Handling
 * Based on JSON-RPC 2.0 error codes and MCP specification
 */

// Standard JSON-RPC 2.0 error codes
export const ErrorCode = {
  // JSON-RPC defined errors
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,

  // MCP specific errors (reserved range: -32000 to -32099)
  ResourceNotFound: -32001,
  ResourceAccessDenied: -32002,
  ToolExecutionError: -32003,
  InvalidResourceType: -32004,
  ServerNotReady: -32005,
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Base MCP Error class
 */
export class MCPError extends Error {
  public readonly code: ErrorCodeType;
  public readonly data?: unknown;

  constructor(code: ErrorCodeType, message: string, data?: unknown) {
    super(message);
    this.name = "MCPError";
    this.code = code;
    this.data = data;
  }

  /**
   * Convert to JSON-RPC error format
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

/**
 * Specific error classes for common scenarios
 */
export class ParseError extends MCPError {
  constructor(message = "Parse error", data?: unknown) {
    super(ErrorCode.ParseError, message, data);
    this.name = "ParseError";
  }
}

export class InvalidRequestError extends MCPError {
  constructor(message = "Invalid request", data?: unknown) {
    super(ErrorCode.InvalidRequest, message, data);
    this.name = "InvalidRequestError";
  }
}

export class MethodNotFoundError extends MCPError {
  constructor(method: string, data?: unknown) {
    super(ErrorCode.MethodNotFound, `Method not found: ${method}`, data);
    this.name = "MethodNotFoundError";
  }
}

export class InvalidParamsError extends MCPError {
  constructor(message = "Invalid parameters", data?: unknown) {
    super(ErrorCode.InvalidParams, message, data);
    this.name = "InvalidParamsError";
  }
}

export class InternalError extends MCPError {
  constructor(message = "Internal error", data?: unknown) {
    super(ErrorCode.InternalError, message, data);
    this.name = "InternalError";
  }
}

export class ResourceNotFoundError extends MCPError {
  constructor(resourceId: string, data?: unknown) {
    super(
      ErrorCode.ResourceNotFound,
      `Resource not found: ${resourceId}`,
      data,
    );
    this.name = "ResourceNotFoundError";
  }
}

export class ResourceAccessDeniedError extends MCPError {
  constructor(resourceId: string, data?: unknown) {
    super(
      ErrorCode.ResourceAccessDenied,
      `Access denied to resource: ${resourceId}`,
      data,
    );
    this.name = "ResourceAccessDeniedError";
  }
}

export class ToolExecutionError extends MCPError {
  constructor(toolName: string, error: string, data?: unknown) {
    super(
      ErrorCode.ToolExecutionError,
      `Tool execution failed for ${toolName}: ${error}`,
      data,
    );
    this.name = "ToolExecutionError";
  }
}

export class InvalidResourceTypeError extends MCPError {
  constructor(type: string, data?: unknown) {
    super(
      ErrorCode.InvalidResourceType,
      `Invalid resource type: ${type}`,
      data,
    );
    this.name = "InvalidResourceTypeError";
  }
}

export class ServerNotReadyError extends MCPError {
  constructor(message = "Server is not ready", data?: unknown) {
    super(ErrorCode.ServerNotReady, message, data);
    this.name = "ServerNotReadyError";
  }
}

/**
 * Error handler utility
 */
export function isErrorResponse(
  response: unknown,
): response is { error: { code: number; message: string } } {
  return (
    typeof response === "object" &&
    response !== null &&
    "error" in response &&
    typeof (response as any).error === "object"
  );
}

/**
 * Convert any error to MCP error format
 */
export function toMCPError(error: unknown): MCPError {
  if (error instanceof MCPError) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, { stack: error.stack });
  }

  return new InternalError("Unknown error occurred", { error });
}
