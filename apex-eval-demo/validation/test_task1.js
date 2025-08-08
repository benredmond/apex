import { jest } from '@jest/globals';
import supertest from 'supertest';
import { AuthService } from '../services/auth/index.js';

describe('Task 1: Input Validation', () => {
  let app;
  let authService;
  
  beforeAll(() => {
    authService = new AuthService();
    app = authService.app;
  });

  beforeEach(() => {
    // Clear rate limiting between tests
    if (authService.cache) {
      authService.cache.flush();
    }
  });

  describe('Email Validation', () => {
    test('rejects invalid email format', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'notanemail', 
          password: 'ValidPassword123' 
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_EMAIL');
      expect(res.body.error.message).toMatch(/valid email/i);
    });

    test('rejects missing email', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          password: 'ValidPassword123' 
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_EMAIL');
    });

    test('accepts valid email format', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'valid@example.com', 
          password: 'ValidPassword123' 
        });
      
      // Should not fail on email validation
      if (res.status === 400) {
        expect(res.body.error.code).not.toBe('INVALID_EMAIL');
      }
    });
  });

  describe('Password Validation', () => {
    test('rejects password shorter than 8 characters', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'test@example.com', 
          password: 'Short1' 
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('WEAK_PASSWORD');
      expect(res.body.error.message).toMatch(/8 character/i);
    });

    test('rejects password without uppercase letter', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'test@example.com', 
          password: 'lowercase123' 
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('WEAK_PASSWORD');
      expect(res.body.error.message).toMatch(/uppercase/i);
    });

    test('rejects password without number', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'test@example.com', 
          password: 'NoNumbers' 
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('WEAK_PASSWORD');
      expect(res.body.error.message).toMatch(/number/i);
    });

    test('accepts valid strong password', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'test@example.com', 
          password: 'ValidPass123' 
        });
      
      // Should not fail on password validation
      if (res.status === 400) {
        expect(res.body.error.code).not.toBe('WEAK_PASSWORD');
      }
    });
  });

  describe('MFA Code Validation', () => {
    test('rejects invalid MFA code format', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'admin@example.com', 
          password: 'AdminPass123',
          mfaCode: 'abc123' // Should be 6 digits
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_MFA_CODE');
      expect(res.body.error.message).toMatch(/6 digit/i);
    });

    test('rejects MFA code with wrong length', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'admin@example.com', 
          password: 'AdminPass123',
          mfaCode: '12345' // Too short
        });
      
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_MFA_CODE');
    });

    test('accepts valid 6-digit MFA code', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'admin@example.com', 
          password: 'AdminPass123',
          mfaCode: '123456'
        });
      
      // Should proceed to MFA verification (not validation error)
      if (res.status === 400) {
        expect(res.body.error.code).not.toBe('INVALID_MFA_CODE');
      }
    });
  });

  describe('Rate Limiting Headers', () => {
    test('includes rate limit headers in successful response', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'user@example.com', 
          password: 'user123' // This should succeed based on mock data
        });
      
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
      expect(res.headers['x-ratelimit-reset']).toBeDefined();
      
      expect(parseInt(res.headers['x-ratelimit-limit'])).toBe(5);
      expect(parseInt(res.headers['x-ratelimit-remaining'])).toBeLessThanOrEqual(5);
    });

    test('includes rate limit headers in error response', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'test@example.com', 
          password: 'weak' 
        });
      
      expect(res.status).toBe(400);
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
      expect(res.headers['x-ratelimit-reset']).toBeDefined();
    });

    test('decrements remaining count with each request', async () => {
      const email = 'ratelimit@example.com';
      
      // First request
      const res1 = await supertest(app)
        .post('/auth/login')
        .send({ email, password: 'Test123456' });
      
      const remaining1 = parseInt(res1.headers['x-ratelimit-remaining']);
      
      // Second request
      const res2 = await supertest(app)
        .post('/auth/login')
        .send({ email, password: 'Test123456' });
      
      const remaining2 = parseInt(res2.headers['x-ratelimit-remaining']);
      
      expect(remaining2).toBe(remaining1 - 1);
    });

    test('blocks requests after rate limit exceeded', async () => {
      const email = 'blocked@example.com';
      
      // Make 5 requests (the limit)
      for (let i = 0; i < 5; i++) {
        await supertest(app)
          .post('/auth/login')
          .send({ email, password: 'Test123456' });
      }
      
      // 6th request should be blocked
      const res = await supertest(app)
        .post('/auth/login')
        .send({ email, password: 'Test123456' });
      
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  describe('Original Functionality', () => {
    test('successful login still works with valid credentials', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'user@example.com', 
          password: 'user123' 
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe('user@example.com');
    });

    test('failed login with wrong password still returns correct error', async () => {
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'user@example.com', 
          password: 'WrongPassword123' 
        });
      
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    test('MFA flow still works for admin user', async () => {
      // Admin has MFA enabled
      const res = await supertest(app)
        .post('/auth/login')
        .send({ 
          email: 'admin@example.com', 
          password: 'admin123' 
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requiresMfa).toBe(true);
    });
  });
});

// Export for test runner
export default {};