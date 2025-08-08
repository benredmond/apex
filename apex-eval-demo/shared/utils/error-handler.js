import { ErrorCode, ServiceResponse } from '../types/index.js';
import winston from 'winston';

// Complex error handling with retry logic, circuit breaker, and rate limiting
export class ErrorHandler {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.circuitBreakers = new Map();
    this.rateLimiters = new Map();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      defaultMeta: { service: serviceName },
      transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
      ]
    });
  }

  async handleWithRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      backoffMultiplier = 2,
      shouldRetry = (error) => error.retryable !== false
    } = options;
    
    let lastError;
    let delay = retryDelay;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check circuit breaker
        const circuitBreaker = this.getCircuitBreaker(operation.name);
        if (circuitBreaker.isOpen()) {
          throw new ServiceError(
            ErrorCode.CIRCUIT_BREAKER_OPEN,
            `Circuit breaker is open for ${operation.name}`
          );
        }
        
        // Check rate limit
        const rateLimiter = this.getRateLimiter(operation.name);
        if (!rateLimiter.allowRequest()) {
          throw new ServiceError(
            ErrorCode.RATE_LIMIT_EXCEEDED,
            `Rate limit exceeded for ${operation.name}`
          );
        }
        
        // Execute operation
        const result = await operation();
        
        // Success - reset circuit breaker
        circuitBreaker.recordSuccess();
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Record failure in circuit breaker
        const circuitBreaker = this.getCircuitBreaker(operation.name);
        circuitBreaker.recordFailure();
        
        // Log error with context
        this.logger.error('Operation failed', {
          operation: operation.name,
          attempt: attempt + 1,
          maxRetries,
          error: {
            code: error.code,
            message: error.message,
            stack: error.stack
          }
        });
        
        // Check if should retry
        if (attempt < maxRetries && shouldRetry(error)) {
          await this.delay(delay);
          delay *= backoffMultiplier;
        } else {
          break;
        }
      }
    }
    
    // All retries exhausted
    throw lastError;
  }

  getCircuitBreaker(operationName) {
    if (!this.circuitBreakers.has(operationName)) {
      this.circuitBreakers.set(operationName, new CircuitBreaker(operationName));
    }
    return this.circuitBreakers.get(operationName);
  }

  getRateLimiter(operationName) {
    if (!this.rateLimiters.has(operationName)) {
      this.rateLimiters.set(operationName, new RateLimiter(operationName));
    }
    return this.rateLimiters.get(operationName);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Pattern: Error aggregation and categorization
  categorizeError(error) {
    if (error.code && error.code.startsWith('AUTH')) {
      return 'authentication';
    } else if (error.code && error.code.startsWith('VAL')) {
      return 'validation';
    } else if (error.code && error.code.startsWith('DB')) {
      return 'database';
    } else if (error.code && error.code.startsWith('SVC')) {
      return 'service';
    } else if (error.code && error.code.startsWith('BUS')) {
      return 'business';
    }
    return 'unknown';
  }

  // Pattern: Error transformation for API responses
  transformForAPI(error, context) {
    const category = this.categorizeError(error);
    
    // Don't expose internal errors to clients
    if (category === 'database' || category === 'service') {
      return ServiceResponse.error(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Service temporarily unavailable',
        { requestId: context.requestId }
      );
    }
    
    // Transform known errors
    return ServiceResponse.error(
      error.code || 'UNKNOWN',
      error.message || 'An unexpected error occurred',
      {
        requestId: context.requestId,
        timestamp: new Date()
      }
    );
  }
}

// Circuit breaker implementation
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  isOpen() {
    if (this.state === 'OPEN') {
      // Check if should transition to half-open
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    } else if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
    }
  }
}

// Rate limiter implementation
class RateLimiter {
  constructor(name, options = {}) {
    this.name = name;
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.requests = [];
  }

  allowRequest() {
    const now = Date.now();
    
    // Remove old requests outside window
    this.requests = this.requests.filter(
      time => now - time < this.windowMs
    );
    
    // Check if under limit
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }
    
    return false;
  }
}

export class ServiceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
    this.retryable = details.retryable !== false;
  }
}