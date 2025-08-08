import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { UserRole, ErrorCode, ServiceContext, ServiceResponse } from '../../shared/types/index.js';
import { ErrorHandler, ServiceError } from '../../shared/utils/error-handler.js';
import { CacheManager } from '../../shared/database/cache.js';
import { EventBus } from '../../shared/utils/event-bus.js';

// Complex authentication service with patterns
export class AuthService {
  constructor() {
    this.app = express();
    this.errorHandler = new ErrorHandler('auth-service');
    this.cache = new CacheManager();
    this.eventBus = new EventBus();
    this.tokenBlacklist = new Set();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    
    // Pattern: Request context middleware
    this.app.use((req, res, next) => {
      req.context = new ServiceContext(
        null,
        UserRole.USER,
        req.headers['x-request-id'] || this.generateRequestId(),
        req.headers['x-correlation-id'] || this.generateCorrelationId()
      );
      next();
    });
    
    // Pattern: Security headers middleware
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });
  }

  setupRoutes() {
    // Pattern: Async route wrapper to handle errors
    const asyncHandler = (fn) => (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

    // Complex authentication endpoint with multiple patterns
    this.app.post('/auth/login', asyncHandler(async (req, res) => {
      const { email, password, mfaCode } = req.body;
      
      // Pattern: Input validation with early return
      if (!email || !password) {
        throw new ServiceError(
          ErrorCode.VALIDATION_FAILED,
          'Email and password are required'
        );
      }
      
      // Pattern: Rate limiting per email
      const rateLimitKey = `login:${email}`;
      const attempts = await this.cache.increment(rateLimitKey, 60); // 1 minute window
      
      if (attempts > 5) {
        throw new ServiceError(
          ErrorCode.RATE_LIMIT_EXCEEDED,
          'Too many login attempts. Please try again later.'
        );
      }
      
      // Pattern: User lookup with cache
      let user = await this.cache.get(`user:${email}`);
      
      if (!user) {
        // Simulate database lookup
        user = await this.findUserByEmail(email);
        
        if (!user) {
          // Pattern: Timing attack prevention
          await this.simulatePasswordHash();
          throw new ServiceError(
            ErrorCode.INVALID_CREDENTIALS,
            'Invalid email or password'
          );
        }
        
        // Cache user for future lookups
        await this.cache.set(`user:${email}`, user, 300); // 5 minutes
      }
      
      // Pattern: Password verification
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      
      if (!isValidPassword) {
        throw new ServiceError(
          ErrorCode.INVALID_CREDENTIALS,
          'Invalid email or password'
        );
      }
      
      // Pattern: MFA verification if enabled
      if (user.mfaEnabled) {
        if (!mfaCode) {
          return res.status(200).json(
            ServiceResponse.success(
              { requiresMfa: true },
              { partial: true }
            )
          );
        }
        
        const isValidMfa = await this.verifyMfaCode(user.id, mfaCode);
        if (!isValidMfa) {
          throw new ServiceError(
            ErrorCode.INVALID_CREDENTIALS,
            'Invalid MFA code'
          );
        }
      }
      
      // Pattern: JWT token generation with claims
      const token = this.generateToken(user);
      const refreshToken = this.generateRefreshToken(user);
      
      // Pattern: Session management
      await this.createSession(user.id, token, refreshToken);
      
      // Pattern: Event emission for audit logging
      await this.eventBus.emit('user.logged_in', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        timestamp: new Date()
      });
      
      // Clear rate limit on successful login
      await this.cache.delete(rateLimitKey);
      
      res.json(ServiceResponse.success({
        token,
        refreshToken,
        expiresIn: 3600,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      }));
    }));

    // Pattern: Token refresh endpoint with rotation
    this.app.post('/auth/refresh', asyncHandler(async (req, res) => {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        throw new ServiceError(
          ErrorCode.INVALID_TOKEN,
          'Refresh token is required'
        );
      }
      
      // Pattern: Token rotation for security
      const decoded = await this.verifyRefreshToken(refreshToken);
      
      // Check if token is blacklisted
      if (this.tokenBlacklist.has(refreshToken)) {
        throw new ServiceError(
          ErrorCode.INVALID_TOKEN,
          'Token has been revoked'
        );
      }
      
      // Blacklist old token
      this.tokenBlacklist.add(refreshToken);
      
      // Generate new tokens
      const user = await this.findUserById(decoded.userId);
      const newToken = this.generateToken(user);
      const newRefreshToken = this.generateRefreshToken(user);
      
      // Update session
      await this.updateSession(user.id, newToken, newRefreshToken);
      
      res.json(ServiceResponse.success({
        token: newToken,
        refreshToken: newRefreshToken,
        expiresIn: 3600
      }));
    }));

    // Pattern: Middleware for protected routes
    this.app.use('/protected', this.authenticateToken.bind(this));
    
    // Pattern: Authorization middleware with role checking
    this.app.get('/admin/*', this.requireRole(UserRole.ADMIN), asyncHandler(async (req, res) => {
      res.json(ServiceResponse.success({
        message: 'Admin access granted',
        user: req.context
      }));
    }));

    // Pattern: Error handling middleware (must be last)
    this.app.use((error, req, res, next) => {
      const response = this.errorHandler.transformForAPI(error, req.context);
      const statusCode = this.getStatusCodeForError(error);
      res.status(statusCode).json(response);
    });
  }

  // Pattern: JWT token generation with custom claims
  generateToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: this.getPermissionsForRole(user.role)
      },
      process.env.JWT_SECRET || 'default-secret',
      {
        expiresIn: '1h',
        issuer: 'auth-service',
        audience: 'microservices-api',
        subject: user.id.toString()
      }
    );
  }

  generateRefreshToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        type: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      {
        expiresIn: '7d'
      }
    );
  }

  // Pattern: Token verification middleware with caching
  async authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;
    
    if (!token) {
      return res.status(401).json(
        ServiceResponse.error(
          ErrorCode.INVALID_TOKEN,
          'Authentication required'
        )
      );
    }
    
    try {
      // Check cache first
      const cached = await this.cache.get(`token:${token}`);
      if (cached === 'invalid') {
        throw new ServiceError(ErrorCode.INVALID_TOKEN, 'Token is invalid');
      }
      
      if (cached) {
        req.context = new ServiceContext(
          cached.userId,
          cached.role,
          req.context.requestId,
          req.context.correlationId
        );
        return next();
      }
      
      // Verify token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'default-secret',
        {
          issuer: 'auth-service',
          audience: 'microservices-api'
        }
      );
      
      // Cache valid token
      await this.cache.set(`token:${token}`, decoded, 300); // 5 minutes
      
      req.context = new ServiceContext(
        decoded.userId,
        decoded.role,
        req.context.requestId,
        req.context.correlationId
      );
      
      next();
    } catch (error) {
      // Cache invalid token to prevent repeated verification
      await this.cache.set(`token:${token}`, 'invalid', 60);
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json(
          ServiceResponse.error(
            ErrorCode.TOKEN_EXPIRED,
            'Token has expired'
          )
        );
      }
      
      return res.status(401).json(
        ServiceResponse.error(
          ErrorCode.INVALID_TOKEN,
          'Invalid authentication token'
        )
      );
    }
  }

  // Pattern: Role-based authorization middleware factory
  requireRole(requiredRole) {
    return (req, res, next) => {
      if (!req.context.hasPermission(requiredRole)) {
        return res.status(403).json(
          ServiceResponse.error(
            ErrorCode.INSUFFICIENT_PERMISSIONS,
            `Role ${requiredRole} is required`
          )
        );
      }
      next();
    };
  }

  // Helper methods with patterns
  async findUserByEmail(email) {
    // Simulate database lookup with intentional delay
    await this.delay(100);
    
    // Mock user data
    if (email === 'admin@example.com') {
      return {
        id: '1',
        email: 'admin@example.com',
        passwordHash: await bcrypt.hash('admin123', 10),
        role: UserRole.ADMIN,
        mfaEnabled: true
      };
    } else if (email === 'user@example.com') {
      return {
        id: '2',
        email: 'user@example.com',
        passwordHash: await bcrypt.hash('user123', 10),
        role: UserRole.USER,
        mfaEnabled: false
      };
    }
    
    return null;
  }

  async findUserById(id) {
    await this.delay(50);
    
    if (id === '1') {
      return {
        id: '1',
        email: 'admin@example.com',
        role: UserRole.ADMIN
      };
    } else if (id === '2') {
      return {
        id: '2',
        email: 'user@example.com',
        role: UserRole.USER
      };
    }
    
    return null;
  }

  async verifyMfaCode(userId, code) {
    // Simulate MFA verification
    await this.delay(100);
    return code === '123456'; // Mock verification
  }

  async simulatePasswordHash() {
    // Prevent timing attacks by simulating hash time
    await bcrypt.hash('dummy', 10);
  }

  async createSession(userId, token, refreshToken) {
    const sessionKey = `session:${userId}`;
    const sessionData = {
      userId,
      token,
      refreshToken,
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    await this.cache.set(sessionKey, sessionData, 86400); // 24 hours
  }

  async updateSession(userId, token, refreshToken) {
    const sessionKey = `session:${userId}`;
    const session = await this.cache.get(sessionKey);
    
    if (session) {
      session.token = token;
      session.refreshToken = refreshToken;
      session.lastActivity = new Date();
      await this.cache.set(sessionKey, session, 86400);
    }
  }

  async verifyRefreshToken(token) {
    return jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET || 'refresh-secret'
    );
  }

  getPermissionsForRole(role) {
    const permissions = {
      [UserRole.ADMIN]: ['read', 'write', 'delete', 'admin'],
      [UserRole.MODERATOR]: ['read', 'write', 'moderate'],
      [UserRole.USER]: ['read', 'write:own'],
      [UserRole.SERVICE]: ['read', 'write', 'service']
    };
    
    return permissions[role] || [];
  }

  getStatusCodeForError(error) {
    if (error.code) {
      if (error.code.startsWith('AUTH')) return 401;
      if (error.code.startsWith('VAL')) return 400;
      if (error.code === ErrorCode.INSUFFICIENT_PERMISSIONS) return 403;
      if (error.code === ErrorCode.RATE_LIMIT_EXCEEDED) return 429;
      if (error.code.startsWith('DB') || error.code.startsWith('SVC')) return 503;
    }
    return 500;
  }

  generateRequestId() {
    return `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  generateCorrelationId() {
    return `corr-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  start(port = 3001) {
    this.app.listen(port, () => {
      console.log(`Auth service listening on port ${port}`);
    });
  }
}

// Export for testing
export default new AuthService();