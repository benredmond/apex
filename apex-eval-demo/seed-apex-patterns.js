#!/usr/bin/env node

// Script to seed APEX with patterns from the demo codebase
// These patterns would normally be discovered through usage

const patterns = [
  // Authentication Patterns
  {
    id: "PAT:AUTH:JWT",
    title: "JWT Token Generation with Custom Claims",
    summary: "Generate JWT tokens with role-based permissions and custom claims",
    trust_score: 0.95,
    usage_count: 156,
    success_rate: 0.94,
    code: `
jwt.sign(
  {
    userId: user.id,
    email: user.email,
    role: user.role,
    permissions: getPermissionsForRole(user.role)
  },
  process.env.JWT_SECRET,
  {
    expiresIn: '1h',
    issuer: 'auth-service',
    audience: 'microservices-api',
    subject: user.id.toString()
  }
)`,
    tags: ["auth", "jwt", "security"]
  },
  
  {
    id: "PAT:AUTH:RATE_LIMIT",
    title: "Rate Limiting with Cache",
    summary: "Implement rate limiting using cache with configurable windows",
    trust_score: 0.92,
    usage_count: 89,
    success_rate: 0.91,
    code: `
const rateLimitKey = \`login:\${email}\`;
const attempts = await cache.increment(rateLimitKey, 60); // 1 minute window

if (attempts > 5) {
  throw new ServiceError(
    ErrorCode.RATE_LIMIT_EXCEEDED,
    'Too many attempts. Please try again later.'
  );
}`,
    tags: ["auth", "rate-limit", "security"]
  },

  // Error Handling Patterns
  {
    id: "PAT:ERROR:HANDLING",
    title: "Comprehensive Error Handler with Retry",
    summary: "Error handling with retry logic, circuit breaker, and categorization",
    trust_score: 0.88,
    usage_count: 234,
    success_rate: 0.87,
    code: `
async handleWithRetry(operation, options = {}) {
  const { maxRetries = 3, retryDelay = 1000, backoffMultiplier = 2 } = options;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (circuitBreaker.isOpen()) {
        throw new ServiceError(ErrorCode.CIRCUIT_BREAKER_OPEN);
      }
      
      const result = await operation();
      circuitBreaker.recordSuccess();
      return result;
      
    } catch (error) {
      circuitBreaker.recordFailure();
      if (attempt < maxRetries && error.retryable) {
        await delay(retryDelay * Math.pow(backoffMultiplier, attempt));
      } else {
        throw error;
      }
    }
  }
}`,
    tags: ["error", "retry", "resilience"]
  },

  {
    id: "PAT:ERROR:TRANSFORM",
    title: "Error Transformation for API",
    summary: "Transform internal errors to client-safe responses",
    trust_score: 0.91,
    usage_count: 178,
    success_rate: 0.90,
    code: `
transformForAPI(error, context) {
  const category = this.categorizeError(error);
  
  // Don't expose internal errors
  if (category === 'database' || category === 'service') {
    return ServiceResponse.error(
      ErrorCode.SERVICE_UNAVAILABLE,
      'Service temporarily unavailable',
      { requestId: context.requestId }
    );
  }
  
  return ServiceResponse.error(
    error.code || 'UNKNOWN',
    error.message || 'An unexpected error occurred',
    { requestId: context.requestId }
  );
}`,
    tags: ["error", "api", "security"]
  },

  // Middleware Patterns
  {
    id: "PAT:MIDDLEWARE:CONTEXT",
    title: "Request Context Middleware",
    summary: "Add request context with correlation ID for tracing",
    trust_score: 0.93,
    usage_count: 145,
    success_rate: 0.92,
    code: `
app.use((req, res, next) => {
  req.context = new ServiceContext(
    null,
    UserRole.USER,
    req.headers['x-request-id'] || generateRequestId(),
    req.headers['x-correlation-id'] || generateCorrelationId()
  );
  next();
});`,
    tags: ["middleware", "tracing", "observability"]
  },

  {
    id: "PAT:MIDDLEWARE:ASYNC",
    title: "Async Route Handler Wrapper",
    summary: "Wrap async routes to handle errors properly",
    trust_score: 0.96,
    usage_count: 267,
    success_rate: 0.95,
    code: `
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.post('/route', asyncHandler(async (req, res) => {
  // async route logic
}));`,
    tags: ["middleware", "async", "error"]
  },

  // Validation Patterns
  {
    id: "PAT:VALIDATION:JOI",
    title: "Input Validation with Joi",
    summary: "Validate request input using Joi schemas",
    trust_score: 0.89,
    usage_count: 198,
    success_rate: 0.88,
    code: `
const schema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[A-Z])(?=.*\d)/).required(),
  mfaCode: Joi.string().length(6).optional()
});

const { error, value } = schema.validate(req.body);
if (error) {
  throw new ServiceError(
    ErrorCode.VALIDATION_FAILED,
    error.details[0].message
  );
}`,
    tags: ["validation", "security", "input"]
  },

  // Cache Patterns
  {
    id: "PAT:CACHE:TTL",
    title: "Cache with TTL Management",
    summary: "Implement caching with automatic TTL expiration",
    trust_score: 0.87,
    usage_count: 134,
    success_rate: 0.86,
    code: `
async get(key) {
  const ttl = this.ttls.get(key);
  if (ttl && Date.now() > ttl) {
    this.store.delete(key);
    this.ttls.delete(key);
    return null;
  }
  return this.store.get(key);
}

async set(key, value, ttlSeconds = 0) {
  this.store.set(key, value);
  if (ttlSeconds > 0) {
    this.ttls.set(key, Date.now() + (ttlSeconds * 1000));
  }
}`,
    tags: ["cache", "performance", "ttl"]
  },

  // Circuit Breaker Pattern
  {
    id: "PAT:RESILIENCE:CIRCUIT_BREAKER",
    title: "Circuit Breaker Implementation",
    summary: "Prevent cascading failures with circuit breaker",
    trust_score: 0.85,
    usage_count: 67,
    success_rate: 0.84,
    code: `
class CircuitBreaker {
  constructor(name, options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000;
    this.state = 'CLOSED';
  }
  
  isOpen() {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }
}`,
    tags: ["resilience", "circuit-breaker", "fault-tolerance"]
  },

  // Fix Patterns (Common Issues)
  {
    id: "FIX:ASYNC:RACE_CONDITION",
    title: "Fix Race Condition in Token Refresh",
    summary: "Use mutex to prevent concurrent token refresh",
    trust_score: 0.82,
    usage_count: 23,
    success_rate: 0.91,
    code: `
// Problem: Multiple requests refreshing token simultaneously
// Solution: Use mutex lock

const mutex = new Mutex();

async refreshToken(token) {
  const release = await mutex.acquire();
  try {
    // Check if another request already refreshed
    const cached = await cache.get(\`token:\${token}\`);
    if (cached && cached.refreshed) {
      return cached.newToken;
    }
    
    // Perform refresh
    const newToken = await generateNewToken();
    await cache.set(\`token:\${token}\`, { refreshed: true, newToken });
    return newToken;
  } finally {
    release();
  }
}`,
    tags: ["fix", "concurrency", "race-condition"]
  },

  {
    id: "FIX:AUTH:TIMING_ATTACK",
    title: "Prevent Timing Attack in Auth",
    summary: "Always hash even when user not found",
    trust_score: 0.94,
    usage_count: 45,
    success_rate: 0.98,
    code: `
// Problem: Early return reveals user existence
// Solution: Always perform hash operation

const user = await findUserByEmail(email);

if (!user) {
  // Still perform hash to prevent timing attack
  await bcrypt.hash('dummy', 10);
  throw new ServiceError(ErrorCode.INVALID_CREDENTIALS);
}

const isValid = await bcrypt.compare(password, user.passwordHash);`,
    tags: ["fix", "security", "timing-attack"]
  },

  // Testing Patterns
  {
    id: "PAT:TEST:MOCK",
    title: "Service Mocking Pattern",
    summary: "Mock external services for testing",
    trust_score: 0.90,
    usage_count: 156,
    success_rate: 0.89,
    code: `
jest.mock('../../shared/database/cache.js', () => ({
  CacheManager: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
    increment: jest.fn().mockResolvedValue(1)
  }))
}));`,
    tags: ["test", "mock", "jest"]
  },

  // Observability Patterns
  {
    id: "PAT:OBSERVABILITY:TRACING",
    title: "Distributed Tracing Implementation",
    summary: "Add tracing across microservices",
    trust_score: 0.86,
    usage_count: 78,
    success_rate: 0.85,
    code: `
class Tracer {
  startSpan(name, parentContext = null) {
    const span = {
      id: generateSpanId(),
      traceId: parentContext?.traceId || generateTraceId(),
      name,
      startTime: Date.now(),
      tags: {},
      logs: []
    };
    
    return {
      span,
      finish: () => {
        span.endTime = Date.now();
        span.duration = span.endTime - span.startTime;
        this.reportSpan(span);
      }
    };
  }
}`,
    tags: ["observability", "tracing", "monitoring"]
  }
];

// Anti-patterns to avoid
const antiPatterns = [
  {
    id: "ANTI:AUTH:PLAIN_PASSWORD",
    title: "Storing Plain Passwords",
    reason: "Security vulnerability - always hash passwords",
    examples: ["password: user.password", "user.password === inputPassword"]
  },
  {
    id: "ANTI:ERROR:EXPOSE_INTERNAL",
    title: "Exposing Internal Errors",
    reason: "Security risk - reveals system internals to attackers",
    examples: ["res.json({ error: error.stack })", "message: error.toString()"]
  },
  {
    id: "ANTI:ASYNC:UNHANDLED_REJECTION",
    title: "Unhandled Promise Rejection",
    reason: "Can crash the application",
    examples: ["promise.then()", "async function without try-catch"]
  }
];

// Export for APEX consumption
export default {
  patterns,
  antiPatterns,
  metadata: {
    source: "apex-eval-demo",
    extractedAt: new Date().toISOString(),
    totalPatterns: patterns.length,
    averageTrustScore: patterns.reduce((acc, p) => acc + p.trust_score, 0) / patterns.length
  }
};

// If run directly, output patterns
if (process.argv[1] === import.meta.url.slice(7)) {
  console.log('APEX Patterns Extracted from Demo Codebase');
  console.log('==========================================\n');
  
  console.log(`Total Patterns: ${patterns.length}`);
  console.log(`Anti-patterns: ${antiPatterns.length}`);
  console.log(`Average Trust Score: ${(patterns.reduce((acc, p) => acc + p.trust_score, 0) / patterns.length).toFixed(2)}\n`);
  
  console.log('Top Patterns by Trust Score:');
  patterns
    .sort((a, b) => b.trust_score - a.trust_score)
    .slice(0, 5)
    .forEach(p => {
      console.log(`  ${p.id} (★${'★'.repeat(Math.floor(p.trust_score * 5))}): ${p.title}`);
    });
}