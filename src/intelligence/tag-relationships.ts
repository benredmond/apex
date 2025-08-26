/**
 * Tag relationship system with programmatic bidirectional generation
 * [APE-63] Multi-Dimensional Pattern Tagging System
 *
 * Source relationships are unidirectional semantic connections.
 * Bidirectional mappings are generated automatically to ensure consistency.
 * Maximum 2-level expansion to prevent performance issues.
 */

export interface TagRelationships {
  [tag: string]: string[];
}

export interface SourceRelationships {
  [tag: string]: string[];
}

// Source relationship definitions - clean, domain-organized
const SOURCE_RELATIONSHIPS: SourceRelationships = {
  // Authentication & Security Domain
  authentication: [
    "security",
    "auth",
    "login",
    "identity",
    "access-control",
    "jwt",
    "session",
    "oauth",
    "sso",
  ],
  auth: [
    "security",
    "login",
    "authorization",
    "jwt",
    "oauth",
    "token",
    "session",
  ],
  security: ["authorization", "encryption", "vulnerability", "protection"],
  jwt: ["token", "session", "oauth"],
  oauth: ["sso", "authorization"],
  session: ["state", "cookie"],

  // Add cross-connections for security terms
  identity: ["access-control", "login"],
  "access-control": ["authorization", "identity"],
  encryption: ["security", "protection"],
  vulnerability: ["protection", "security"],
  protection: ["encryption", "vulnerability"],
  state: ["cookie", "session"],
  cookie: ["state", "session"],

  // Error & Issue Domain
  bug: ["fix", "error", "issue", "problem", "defect", "failure", "crash"],
  error: ["exception", "failure", "issue", "problem"],
  fix: ["patch", "repair", "resolve", "solution"],
  exception: ["throw", "catch", "handling"],

  // Add cross-connections for error terms
  defect: ["crash", "bug"],
  crash: ["failure", "defect"],
  repair: ["resolve", "fix"],
  resolve: ["solution", "repair"],
  solution: ["resolve", "fix"],
  throw: ["catch", "exception"],
  catch: ["handling", "throw"],
  handling: ["catch", "exception"],

  // Performance & Optimization Domain
  performance: [
    "optimization",
    "speed",
    "latency",
    "efficiency",
    "perf",
    "cache",
    "benchmark",
  ],
  optimization: ["improve", "enhance", "speed", "efficiency"],
  cache: ["caching", "storage", "memory", "redis", "memoization"],
  caching: ["memoization"],
  redis: ["database", "storage", "memory"],

  // Add cross-connections for performance terms
  latency: ["perf", "performance"],
  perf: ["benchmark", "latency"],
  benchmark: ["perf", "performance"],
  improve: ["enhance", "optimization"],
  enhance: ["improve", "optimization"],
  speed: ["efficiency", "performance"],
  efficiency: ["speed", "optimization"],
  memoization: ["caching", "cache"],
  memory: ["cache", "storage"],
  storage: ["memory", "database"],

  // Testing Domain
  test: [
    "testing",
    "unit",
    "integration",
    "jest",
    "pytest",
    "coverage",
    "spec",
    "mock",
  ],
  testing: ["qa", "validation", "verification", "jest", "pytest", "mock"],
  jest: ["javascript", "unit"],
  pytest: ["python", "unit"],
  mock: ["stub", "fake", "simulation"],

  // Add cross-connections for testing terms
  unit: ["integration", "test"],
  integration: ["unit", "test"],
  coverage: ["spec", "test"],
  spec: ["coverage", "test"],
  qa: ["verification", "testing"],
  verification: ["qa", "validation"],
  stub: ["fake", "mock"],
  fake: ["simulation", "stub"],
  simulation: ["fake", "mock"],

  // Database & Storage Domain
  database: [
    "db",
    "sql",
    "storage",
    "persistence",
    "query",
    "sqlite",
    "postgres",
    "mongodb",
    "redis",
  ],
  db: ["storage", "persistence"],
  sql: ["query", "sqlite", "postgres", "mysql"],
  sqlite: ["embedded", "local"],
  postgres: ["postgresql"],
  mongodb: ["nosql", "document", "storage"],

  // Add cross-connections for database terms
  persistence: ["storage", "database"],
  query: ["search", "database"],
  embedded: ["local", "sqlite"],
  local: ["embedded", "sqlite"],
  postgresql: ["postgres", "sql"],
  mysql: ["sql", "database"],
  nosql: ["document", "mongodb"],
  document: ["nosql", "storage"],

  // API & Networking Domain
  api: ["endpoint", "rest", "graphql", "http", "service", "interface"],
  rest: ["http", "restful", "endpoint"],
  graphql: ["query", "schema", "graph"],
  http: ["request", "response", "network"],
  endpoint: ["route", "url", "path"],

  // Add cross-connections for API terms
  service: ["interface", "api"],
  interface: ["service", "ui"],
  restful: ["rest", "api"],
  schema: ["graph", "graphql"],
  graph: ["schema", "graphql"],
  request: ["response", "http"],
  response: ["request", "network"],
  network: ["response", "http"],
  route: ["url", "endpoint"],
  url: ["path", "route"],
  path: ["url", "endpoint"],

  // Frontend & UI Domain
  ui: ["frontend", "interface", "ux", "component", "view", "react", "vue"],
  frontend: ["client", "browser", "web", "react", "vue", "component"],
  react: ["component", "javascript", "jsx"],
  vue: ["component", "javascript"],
  component: ["module", "widget"],

  // Add cross-connections for UI terms
  ux: ["view", "ui"],
  view: ["ux", "ui"],
  client: ["browser", "frontend"],
  browser: ["web", "client"],
  web: ["browser", "frontend"],
  jsx: ["react", "javascript"],
  module: ["widget", "component"],
  widget: ["module", "ui"],

  // Architecture & Patterns Domain
  pattern: ["design", "architecture", "template", "convention"],
  architecture: ["design", "structure", "system"],
  refactor: ["restructure", "reorganize", "improve", "cleanup", "redesign"],
  migration: ["upgrade", "transition", "schema", "version", "update"],

  // Add cross-connections for architecture terms
  design: ["template", "pattern"],
  template: ["convention", "design"],
  convention: ["template", "pattern"],
  structure: ["system", "architecture"],
  system: ["structure", "architecture"],
  restructure: ["reorganize", "refactor"],
  reorganize: ["cleanup", "restructure"],
  cleanup: ["redesign", "reorganize"],
  redesign: ["restructure", "refactor"],
  upgrade: ["transition", "migration"],
  transition: ["version", "upgrade"],
  version: ["update", "transition"],

  // Development Workflow Domain
  async: ["asynchronous", "promise", "await", "concurrent", "parallel"],
  sync: ["synchronous", "blocking", "sequential"],
  validation: [
    "verify",
    "check",
    "validate",
    "sanitize",
    "constraint",
    "testing",
  ],
  search: ["find", "query", "lookup", "discover", "match"],

  // Add cross-connections for workflow terms
  asynchronous: ["promise", "async"],
  promise: ["await", "asynchronous"],
  await: ["concurrent", "promise"],
  concurrent: ["parallel", "await"],
  parallel: ["concurrent", "async"],
  synchronous: ["blocking", "sync"],
  blocking: ["sequential", "synchronous"],
  sequential: ["blocking", "sync"],
  verify: ["check", "validation"],
  check: ["validate", "verify"],
  validate: ["sanitize", "check"],
  sanitize: ["constraint", "validate"],
  constraint: ["sanitize", "validation"],
  find: ["lookup", "search"],
  lookup: ["discover", "find"],
  discover: ["match", "lookup"],
  match: ["discover", "search"],

  // Programming Languages Domain
  typescript: ["javascript", "ts", "type", "typing"],
  javascript: ["js", "node", "ecmascript", "jest", "react", "vue"],
  python: ["py", "script", "pytest"],
  node: ["nodejs", "javascript", "backend", "server"],
  script: ["python", "automation"],

  // Add cross-connections for language terms
  ts: ["type", "typescript"],
  type: ["typing", "ts"],
  typing: ["type", "typescript"],
  js: ["ecmascript", "javascript"],
  ecmascript: ["js", "javascript"],
  py: ["python", "script"],
  nodejs: ["backend", "node"],
  backend: ["server", "nodejs"],
  server: ["backend", "node"],
  automation: ["script", "python"],

  // Common Operations Domain
  create: ["add", "new", "insert", "generate", "build"],
  update: ["modify", "edit", "change", "patch", "migration"],
  delete: ["remove", "destroy", "drop", "clean"],
  import: ["require", "include", "load", "module"],
  export: ["expose", "provide", "output"],

  // Add cross-connections for operation terms
  add: ["new", "create"],
  new: ["insert", "add"],
  insert: ["generate", "new"],
  generate: ["build", "insert"],
  build: ["generate", "create"],
  modify: ["edit", "update"],
  edit: ["change", "modify"],
  change: ["patch", "edit"],
  patch: ["update", "change"],
  remove: ["destroy", "delete"],
  destroy: ["drop", "remove"],
  drop: ["clean", "destroy"],
  clean: ["drop", "delete"],
  require: ["include", "import"],
  include: ["load", "require"],
  load: ["module", "include"],
  expose: ["provide", "export"],
  provide: ["output", "expose"],
  output: ["provide", "export"],
};

/**
 * Generate bidirectional relationship mappings from source definitions
 */
function generateBidirectionalMappings(
  source: SourceRelationships,
): TagRelationships {
  const bidirectional: TagRelationships = {};

  // Initialize all tags
  const allTags = new Set<string>();
  for (const [tag, related] of Object.entries(source)) {
    allTags.add(tag);
    related.forEach((t) => allTags.add(t));
  }

  for (const tag of allTags) {
    bidirectional[tag] = [];
  }

  // Generate bidirectional mappings
  for (const [sourceTag, relatedTags] of Object.entries(source)) {
    for (const targetTag of relatedTags) {
      // Add forward relationship
      if (!bidirectional[sourceTag].includes(targetTag)) {
        bidirectional[sourceTag].push(targetTag);
      }

      // Add reverse relationship
      if (!bidirectional[targetTag].includes(sourceTag)) {
        bidirectional[targetTag].push(sourceTag);
      }
    }
  }

  // Sort relationships for consistency
  for (const tag of Object.keys(bidirectional)) {
    bidirectional[tag].sort();
  }

  return bidirectional;
}

/**
 * Validate bidirectional relationships
 */
export function validateBidirectionalRelationships(
  relationships: TagRelationships,
): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check bidirectionality
  for (const [tag, related] of Object.entries(relationships)) {
    for (const relatedTag of related) {
      if (!relationships[relatedTag]) {
        issues.push(`Missing key: ${relatedTag} (referenced by ${tag})`);
      } else if (!relationships[relatedTag].includes(tag)) {
        issues.push(`Missing reverse: ${relatedTag} -> ${tag}`);
      }
    }
  }

  // Check minimum relationship count
  for (const [tag, related] of Object.entries(relationships)) {
    if (related.length < 2) {
      issues.push(`Insufficient relationships: ${tag} (${related.length})`);
    }
  }

  // Check for self-references
  for (const [tag, related] of Object.entries(relationships)) {
    if (related.includes(tag)) {
      issues.push(`Self-reference: ${tag}`);
    }
  }

  return { isValid: issues.length === 0, issues };
}

// Generate the final bidirectional relationships
export const TAG_RELATIONSHIPS: TagRelationships =
  generateBidirectionalMappings(SOURCE_RELATIONSHIPS);

/**
 * Get all related tags for a given tag (including the tag itself)
 */
export function getRelatedTags(tag: string): string[] {
  const normalizedTag = tag.toLowerCase();
  const related = TAG_RELATIONSHIPS[normalizedTag] || [];
  return [normalizedTag, ...related];
}

/**
 * Check if two tags are related
 */
export function areTagsRelated(tag1: string, tag2: string): boolean {
  const normalized1 = tag1.toLowerCase();
  const normalized2 = tag2.toLowerCase();

  if (normalized1 === normalized2) return true;

  const related1 = TAG_RELATIONSHIPS[normalized1] || [];
  const related2 = TAG_RELATIONSHIPS[normalized2] || [];

  return related1.includes(normalized2) || related2.includes(normalized1);
}
