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
 * Optimization Strategy:
 * - JSON Schema is ONLY for AI documentation (Claude reads it to understand params)
 * - Actual validation happens in Zod (runtime, strict)
 * - We can simplify JSON Schema aggressively without losing validation safety
 * - Removes additionalProperties, deeply nested schemas, and verbose types
 *
 * @param zodSchema - The Zod schema to convert
 * @param name - The schema name for $schema identifier
 * @returns Simplified JSON Schema optimized for token usage
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

  // Apply aggressive optimizations to reduce token usage
  schema = removeAdditionalProperties(schema);
  schema = simplifyNestedSchemas(schema, 0);
  schema = stripDescriptions(schema);

  return schema;
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

/**
 * Simplifies deeply nested schemas to reduce token usage.
 * Strategy: Keep top-level detail, collapse deep nesting into generic types.
 * This preserves enough info for AI understanding while cutting tokens dramatically.
 */
function simplifyNestedSchemas(schema: any, depth: number): any {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(s => simplifyNestedSchemas(s, depth));
  }

  // At depth 2+, simplify complex structures aggressively
  if (depth >= 2) {
    // Collapse anyOf/oneOf unions to generic object
    if (schema.anyOf || schema.oneOf) {
      return {
        type: 'object',
        description: schema.description || 'Complex union type (see Zod schema for details)',
      };
    }

    // Collapse array items to generic object if complex
    if (schema.type === 'array' && schema.items?.anyOf) {
      return {
        type: 'array',
        items: { type: 'object' },
        description: schema.description,
      };
    }

    // Collapse objects with many properties to generic object
    if (schema.type === 'object' && schema.properties && Object.keys(schema.properties).length > 5) {
      return {
        type: 'object',
        description: schema.description || `Object with ${Object.keys(schema.properties).length} properties`,
        required: schema.required,
      };
    }
  }

  // Recurse into structure
  const simplified: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties' && typeof value === 'object') {
      // Recurse into properties at next depth level
      const props: any = {};
      for (const [propKey, propValue] of Object.entries(value as any)) {
        props[propKey] = simplifyNestedSchemas(propValue, depth + 1);
      }
      simplified[key] = props;
    } else if (key === 'items') {
      simplified[key] = simplifyNestedSchemas(value, depth + 1);
    } else if (key === 'anyOf' || key === 'oneOf') {
      // Keep union types at top level (depth 0-1), simplify deeper ones
      if (depth < 2) {
        simplified[key] = (value as any[]).map(v => simplifyNestedSchemas(v, depth + 1));
      } else {
        // Replace with generic object at depth 2+
        return {
          type: 'object',
          description: schema.description || 'Union type (see Zod for details)',
        };
      }
    } else {
      simplified[key] = value;
    }
  }

  return simplified;
}

/**
 * Strips all description fields from schema to minimize token usage.
 * Schema structure and types remain, but explanatory text is removed.
 * AI can still understand the schema from property names and types.
 */
function stripDescriptions(schema: any): any {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(stripDescriptions);
  }

  const stripped: any = {};
  for (const [key, value] of Object.entries(schema)) {
    // Remove description and markdownDescription fields
    if (key === 'description' || key === 'markdownDescription') {
      continue;
    }
    stripped[key] = stripDescriptions(value);
  }
  return stripped;
}
