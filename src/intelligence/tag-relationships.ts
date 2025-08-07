/**
 * Static tag relationship mappings for semantic expansion
 * [APE-63] Multi-Dimensional Pattern Tagging System
 *
 * Relationships are bidirectional and used for tag expansion during search.
 * Maximum 2-level expansion to prevent performance issues.
 */

export interface TagRelationships {
  [tag: string]: string[];
}

// Core tag relationships for pattern discovery
export const TAG_RELATIONSHIPS: TagRelationships = {
  // Authentication & Security
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
    "authentication",
    "security",
    "login",
    "authorization",
    "jwt",
    "oauth",
  ],
  security: [
    "authentication",
    "authorization",
    "encryption",
    "vulnerability",
    "protection",
  ],
  jwt: ["authentication", "token", "auth", "session", "oauth"],
  oauth: ["authentication", "auth", "sso", "authorization"],
  session: ["authentication", "auth", "state", "cookie", "jwt"],

  // Errors & Issues
  bug: ["fix", "error", "issue", "problem", "defect", "failure", "crash"],
  error: ["bug", "exception", "failure", "issue", "problem"],
  fix: ["bug", "patch", "repair", "resolve", "solution"],
  exception: ["error", "throw", "catch", "handling"],

  // Performance & Optimization
  performance: [
    "optimization",
    "speed",
    "latency",
    "efficiency",
    "perf",
    "cache",
    "benchmark",
  ],
  optimization: ["performance", "improve", "enhance", "speed", "efficiency"],
  cache: [
    "caching",
    "performance",
    "storage",
    "memory",
    "redis",
    "memoization",
  ],
  caching: ["cache", "performance", "memoization"],
  redis: ["cache", "database", "storage", "memory"],

  // Testing
  test: [
    "testing",
    "unit",
    "integration",
    "jest",
    "pytest",
    "coverage",
    "spec",
  ],
  testing: ["test", "qa", "validation", "verification"],
  jest: ["test", "testing", "javascript", "unit"],
  pytest: ["test", "testing", "python", "unit"],
  mock: ["test", "testing", "stub", "fake", "simulation"],

  // Database & Storage
  database: ["db", "sql", "storage", "persistence", "query"],
  db: ["database", "storage", "persistence"],
  sql: ["database", "query", "sqlite", "postgres", "mysql"],
  sqlite: ["database", "sql", "embedded", "local"],
  postgres: ["database", "sql", "postgresql"],
  mongodb: ["database", "nosql", "document", "storage"],

  // API & Networking
  api: ["endpoint", "rest", "graphql", "http", "service", "interface"],
  rest: ["api", "http", "restful", "endpoint"],
  graphql: ["api", "query", "schema", "graph"],
  http: ["api", "rest", "request", "response", "network"],
  endpoint: ["api", "route", "url", "path"],

  // Frontend & UI
  ui: ["frontend", "interface", "ux", "component", "view"],
  frontend: ["ui", "client", "browser", "web"],
  react: ["frontend", "ui", "component", "javascript", "jsx"],
  vue: ["frontend", "ui", "component", "javascript"],
  component: ["ui", "frontend", "module", "widget"],

  // Patterns & Architecture
  pattern: ["design", "architecture", "template", "convention"],
  architecture: ["design", "structure", "pattern", "system"],
  refactor: ["restructure", "reorganize", "improve", "cleanup", "redesign"],
  migration: ["upgrade", "transition", "schema", "version", "update"],

  // Development Workflow
  async: ["asynchronous", "promise", "await", "concurrent", "parallel"],
  sync: ["synchronous", "blocking", "sequential"],
  validation: ["verify", "check", "validate", "sanitize", "constraint"],
  search: ["find", "query", "lookup", "discover", "match"],

  // Languages & Frameworks
  typescript: ["javascript", "ts", "type", "typing"],
  javascript: ["js", "node", "ecmascript"],
  python: ["py", "script"],
  node: ["nodejs", "javascript", "backend", "server"],

  // Common Operations
  create: ["add", "new", "insert", "generate", "build"],
  update: ["modify", "edit", "change", "patch"],
  delete: ["remove", "destroy", "drop", "clean"],
  import: ["require", "include", "load", "module"],
  export: ["expose", "provide", "output"],
  
  // Add missing reverse mappings
  token: ["jwt", "auth", "authentication"],
  login: ["authentication", "auth"],
  identity: ["authentication"],
  "access-control": ["authentication"],
  sso: ["oauth", "authentication"],
  authorization: ["auth", "security", "oauth"],
  encryption: ["security"],
  vulnerability: ["security"],
  protection: ["security"],
  cookie: ["session"],
  state: ["session"],
  
  // Errors & Issues reverse mappings
  issue: ["bug", "error"],
  problem: ["bug", "error"],
  defect: ["bug"],
  failure: ["bug", "error"],
  crash: ["bug"],
  throw: ["exception"],
  catch: ["exception"],
  handling: ["exception"],
  patch: ["fix"],
  repair: ["fix"],
  resolve: ["fix"],
  solution: ["fix"],
  
  // Performance reverse mappings
  speed: ["performance", "optimization"],
  latency: ["performance"],
  efficiency: ["performance", "optimization"],
  perf: ["performance"],
  benchmark: ["performance"],
  improve: ["optimization"],
  enhance: ["optimization"],
  memoization: ["cache", "caching"],
  memory: ["cache", "redis"],
  storage: ["cache", "database", "redis", "mongodb"],
  
  // Testing reverse mappings
  unit: ["test", "jest", "pytest"],
  integration: ["test"],
  coverage: ["test"],
  spec: ["test"],
  qa: ["testing"],
  verification: ["testing"],
  stub: ["mock"],
  fake: ["mock"],
  simulation: ["mock"],
  
  // Database reverse mappings
  persistence: ["database", "db"],
  query: ["database", "sql", "graphql"],
  embedded: ["sqlite"],
  local: ["sqlite"],
  postgresql: ["postgres"],
  mysql: ["sql"],
  nosql: ["mongodb"],
  document: ["mongodb"],
  
  // API reverse mappings
  service: ["api"],
  interface: ["api", "ui"],
  restful: ["rest"],
  schema: ["graphql"],
  graph: ["graphql"],
  request: ["http"],
  response: ["http"],
  network: ["http"],
  route: ["endpoint"],
  url: ["endpoint"],
  path: ["endpoint"],
  
  // Frontend reverse mappings
  ux: ["ui"],
  view: ["ui"],
  client: ["frontend"],
  browser: ["frontend"],
  web: ["frontend"],
  jsx: ["react"],
  module: ["component", "import"],
  widget: ["component"],
  
  // Pattern reverse mappings
  design: ["pattern", "architecture"],
  template: ["pattern"],
  convention: ["pattern"],
  structure: ["architecture"],
  system: ["architecture"],
  restructure: ["refactor"],
  reorganize: ["refactor"],
  cleanup: ["refactor"],
  redesign: ["refactor"],
  upgrade: ["migration"],
  transition: ["migration"],
  version: ["migration"],
  
  // Development reverse mappings
  asynchronous: ["async"],
  promise: ["async"],
  await: ["async"],
  concurrent: ["async"],
  parallel: ["async"],
  synchronous: ["sync"],
  blocking: ["sync"],
  sequential: ["sync"],
  verify: ["validation"],
  check: ["validation"],
  validate: ["validation"],
  sanitize: ["validation"],
  constraint: ["validation"],
  find: ["search"],
  lookup: ["search"],
  discover: ["search"],
  match: ["search"],
  
  // Languages reverse mappings
  ts: ["typescript"],
  type: ["typescript"],
  typing: ["typescript"],
  js: ["javascript"],
  ecmascript: ["javascript"],
  nodejs: ["node"],
  backend: ["node"],
  server: ["node"],
  py: ["python"],
  
  // Operations reverse mappings
  add: ["create"],
  new: ["create"],
  insert: ["create"],
  generate: ["create"],
  build: ["create"],
  modify: ["update"],
  edit: ["update"],
  change: ["update"],
  remove: ["delete"],
  destroy: ["delete"],
  drop: ["delete"],
  clean: ["delete"],
  require: ["import"],
  include: ["import"],
  load: ["import"],
  expose: ["export"],
  provide: ["export"],
  output: ["export"],
};

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
