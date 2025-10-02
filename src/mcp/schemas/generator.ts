import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodSchema } from 'zod';

/**
 * Generates a JSON Schema from a Zod schema with APEX-specific options.
 *
 * Note: Some Zod constraints cannot be encoded in JSON Schema:
 * - .refine() cross-field validation (e.g., XOR constraints)
 * - Custom error messages
 * These are still enforced at runtime by Zod validation.
 * See docs/mcp-schema-constraints.md for details.
 *
 * Optimization: Removes `additionalProperties: false` from all objects to reduce
 * token usage. Runtime validation by Zod still enforces strict object shapes.
 *
 * @param zodSchema - The Zod schema to convert
 * @param name - The schema name for $schema identifier
 * @returns JSON Schema object compatible with MCP SDK
 */
export function generateToolSchema(zodSchema: ZodSchema, name: string) {
  const fullSchema = zodToJsonSchema(zodSchema, {
    name,
    $refStrategy: 'none', // Inline all definitions
    markdownDescription: true, // Preserve .describe() as description
    errorMessages: false, // Don't include error messages in schema
  }) as any;

  // Extract the actual schema from the definitions if it's using $ref
  let schema = fullSchema;
  if (fullSchema.$ref && fullSchema.definitions) {
    const refName = fullSchema.$ref.replace('#/definitions/', '');
    schema = fullSchema.definitions[refName];
  }

  // Recursively remove additionalProperties to reduce token usage
  // Zod validation still enforces strict schemas at runtime
  return removeAdditionalProperties(schema);
}

/**
 * Recursively removes `additionalProperties` from schema to reduce token usage.
 * This is safe because Zod validation enforces strict object shapes at runtime.
 */
function removeAdditionalProperties(schema: any): any {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(removeAdditionalProperties);
  }

  const cleaned: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') {
      // Skip additionalProperties to reduce tokens
      continue;
    }
    cleaned[key] = removeAdditionalProperties(value);
  }
  return cleaned;
}
