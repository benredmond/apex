#!/usr/bin/env node

/**
 * Script to add new high-value patterns from official documentation
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
const db = new Database(path.join(__dirname, '..', 'patterns.db'));

// Current git SHA for source references
const CURRENT_SHA = 'd071b6745b91fb79c31aa31f318bb5c0c5519513';

// Helper to calculate pattern digest
function calculatePatternDigest(pattern) {
  const canonical = JSON.stringify(pattern, Object.keys(pattern).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// Helper to create timestamp
function timestamp() {
  return new Date().toISOString();
}

// New patterns from official documentation
const newDocPatterns = [
  // MCP Patterns
  {
    id: 'CODE:MCP:SERVER_SETUP',
    type: 'CODEBASE',
    title: 'Basic MCP Server Creation and Initialization',
    summary: 'Standardized pattern for creating and configuring MCP servers with proper naming, versioning, and transport setup',
    snippets: [
      {
        snippet_id: 'mcp-server-1',
        language: 'python',
        content: `from mcp.server.fastmcp import FastMCP

# Create server with descriptive name
mcp = FastMCP("weather-service")

# Start server with stdio transport
if __name__ == "__main__":
    mcp.run()`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/mcp-patterns.md',
          sha: CURRENT_SHA,
          start: 10,
          end: 17
        }
      },
      {
        snippet_id: 'mcp-server-2',
        language: 'typescript',
        content: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "file-manager-server",
  version: "1.0.0"
});

const transport = new StdioServerTransport();
await server.connect(transport);`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/mcp-patterns.md',
          sha: CURRENT_SHA,
          start: 20,
          end: 30
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.85,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  {
    id: 'CODE:MCP:TOOL_IMPLEMENTATION',
    type: 'CODEBASE',
    title: 'Type-Safe Tool Creation with Schema Validation',
    summary: 'Pattern for creating executable tools with proper input validation, type safety, and error handling',
    snippets: [
      {
        snippet_id: 'mcp-tool-1',
        language: 'python',
        content: `@mcp.tool()
def calculate_bmi(weight_kg: float, height_m: float, unit: str = "metric") -> str:
    """Calculate Body Mass Index with optional unit conversion."""
    if weight_kg <= 0 or height_m <= 0:
        raise ValueError("Weight and height must be positive numbers")
    
    bmi = weight_kg / (height_m * height_m)
    return f"BMI: {bmi:.2f} ({unit} units)"

@mcp.tool()
def search_files(directory: str, pattern: str, max_results: int = 10) -> list[str]:
    """Search for files matching a pattern in the specified directory."""
    import glob
    import os
    
    if not os.path.exists(directory):
        raise FileNotFoundError(f"Directory not found: {directory}")
    
    results = glob.glob(os.path.join(directory, pattern))
    return results[:max_results]`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/mcp-tools.md',
          sha: CURRENT_SHA,
          start: 5,
          end: 25
        }
      },
      {
        snippet_id: 'mcp-tool-2',
        language: 'typescript',
        content: `import { z } from "zod";

server.registerTool("file-search", {
  title: "File Search Tool",
  description: "Search for files by pattern",
  inputSchema: {
    directory: z.string().describe("Directory to search in"),
    pattern: z.string().describe("File pattern to match"),
    maxResults: z.number().optional().default(10)
  }
}, async ({ directory, pattern, maxResults }) => {
  try {
    const results = await searchFiles(directory, pattern, maxResults);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(results, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: \`Error: \${error.message}\`
      }],
      isError: true
    };
  }
});`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/mcp-tools.md',
          sha: CURRENT_SHA,
          start: 30,
          end: 58
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.9,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  {
    id: 'CODE:MCP:RESOURCE_HANDLING',
    type: 'CODEBASE',
    title: 'Dynamic Resource Templates with URI Routing',
    summary: 'Pattern for creating contextual data sources with template-based URI routing and dynamic content generation',
    snippets: [
      {
        snippet_id: 'mcp-resource-1',
        language: 'python',
        content: `@mcp.resource("file://documents/{document_id}")
def get_document(document_id: str) -> str:
    """Retrieve document content by ID."""
    # Validate document_id
    if not document_id.isalnum():
        raise ValueError("Invalid document ID format")
    
    document_path = f"/docs/{document_id}.md"
    if not os.path.exists(document_path):
        raise FileNotFoundError(f"Document {document_id} not found")
    
    with open(document_path, 'r') as f:
        return f.read()

@mcp.resource("api://users/{user_id}/profile")
def get_user_profile(user_id: str) -> dict:
    """Get user profile data."""
    return {
        "user_id": user_id,
        "profile": fetch_user_data(user_id),
        "last_updated": datetime.now().isoformat()
    }`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/mcp-resources.md',
          sha: CURRENT_SHA,
          start: 10,
          end: 32
        }
      },
      {
        snippet_id: 'mcp-resource-2',
        language: 'typescript',
        content: `server.registerResource(
  "project-files",
  new ResourceTemplate("file://{project}/{file_path}", { 
    list: ["project"] 
  }),
  {
    title: "Project File Access",
    description: "Access files within project directories"
  },
  async (uri, { project, file_path }) => {
    const fullPath = path.join("/projects", project, file_path);
    
    // Security check - prevent directory traversal
    if (!fullPath.startsWith("/projects/")) {
      throw new Error("Access denied: Path outside project directory");
    }
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: content
        }]
      };
    } catch (error) {
      throw new Error(\`Failed to read file: \${error.message}\`);
    }
  }
);`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/mcp-resources.md',
          sha: CURRENT_SHA,
          start: 40,
          end: 70
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.85,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  // PostgreSQL Patterns
  {
    id: 'CODE:POSTGRES:CONNECTION_POOL',
    type: 'CODEBASE',
    title: 'Production-Ready Connection Pooling with PgBouncer',
    summary: 'Implements efficient connection pooling using PgBouncer to handle high-concurrency database access while minimizing resource overhead',
    snippets: [
      {
        snippet_id: 'pg-pool-1',
        language: 'ini',
        content: `# /etc/pgbouncer/pgbouncer.ini - Production PgBouncer Configuration
[databases]
myapp = host=localhost port=5432 dbname=production_db user=app_user

[pgbouncer]
# Connection limits
max_client_conn = 5000
default_pool_size = 50
max_db_connections = 100

# Pooling mode - transaction pooling for best performance
pool_mode = transaction

# Authentication
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

# Performance tuning
server_idle_timeout = 600
server_lifetime = 3600
server_reset_query = DISCARD ALL

# Logging
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/pgbouncer.ini',
          sha: CURRENT_SHA,
          start: 1,
          end: 26
        }
      },
      {
        snippet_id: 'pg-pool-2',
        language: 'javascript',
        content: `const { Pool } = require('pg');

// Application-side connection pool configuration
const pool = new Pool({
  host: 'localhost',
  port: 6432,  // PgBouncer port, not PostgreSQL direct port
  database: 'myapp',
  user: 'app_user',
  password: process.env.DB_PASSWORD,
  // Keep these numbers lower since PgBouncer handles the real pooling
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Graceful connection handling with retry logic
async function executeQuery(query, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

// Health check for connection pool
async function checkPoolHealth() {
  try {
    const result = await pool.query('SELECT 1');
    console.log(\`Pool status: \${pool.totalCount} total, \${pool.idleCount} idle\`);
    return true;
  } catch (error) {
    console.error('Pool health check failed:', error.message);
    return false;
  }
}`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/postgres-pool.js',
          sha: CURRENT_SHA,
          start: 1,
          end: 36
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.9,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  {
    id: 'CODE:POSTGRES:QUERY_OPTIMIZE',
    type: 'CODEBASE',
    title: 'Performance Tuning with EXPLAIN ANALYZE and Strategic Indexing',
    summary: 'Systematic approach to query optimization using EXPLAIN ANALYZE for performance diagnosis and strategic index creation',
    snippets: [
      {
        snippet_id: 'pg-optimize-1',
        language: 'sql',
        content: `-- Performance analysis workflow
-- Step 1: Baseline query analysis
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
SELECT u.name, COUNT(o.id) as order_count, SUM(o.total) as total_spent
FROM users u 
LEFT JOIN orders o ON u.id = o.user_id 
WHERE u.created_at >= '2024-01-01' 
  AND u.status = 'active'
GROUP BY u.id, u.name 
HAVING COUNT(o.id) > 5
ORDER BY total_spent DESC 
LIMIT 20;

-- Step 2: Create strategic indexes based on EXPLAIN output
-- Composite index for WHERE clause optimization
CREATE INDEX CONCURRENTLY idx_users_active_created 
ON users (status, created_at) 
WHERE status = 'active';

-- Foreign key index for JOIN optimization  
CREATE INDEX CONCURRENTLY idx_orders_user_id_total 
ON orders (user_id, total) 
INCLUDE (id);

-- Step 3: Expression index for complex filtering
CREATE INDEX CONCURRENTLY idx_users_name_lower 
ON users (LOWER(name)) 
WHERE status = 'active';

-- Step 4: Partial index for common query patterns
CREATE INDEX CONCURRENTLY idx_orders_high_value 
ON orders (user_id, created_at) 
WHERE total > 1000;`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/postgres-optimize.sql',
          sha: CURRENT_SHA,
          start: 1,
          end: 33
        }
      },
      {
        snippet_id: 'pg-optimize-2',
        language: 'python',
        content: `import psycopg2
import json
import time
from typing import Dict, List

class QueryOptimizer:
    def __init__(self, connection_string: str):
        self.conn = psycopg2.connect(connection_string)
        
    def analyze_query(self, query: str, params: tuple = None) -> Dict:
        """Analyze query performance with detailed metrics"""
        with self.conn.cursor() as cursor:
            # Enable timing and buffer analysis
            cursor.execute("SET track_io_timing = ON")
            
            explain_query = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {query}"
            start_time = time.time()
            cursor.execute(explain_query, params)
            execution_time = time.time() - start_time
            
            result = cursor.fetchone()[0][0]
            
            return {
                'execution_time_ms': result['Execution Time'],
                'planning_time_ms': result['Planning Time'],
                'total_time_ms': execution_time * 1000,
                'shared_hit_blocks': self._extract_buffer_stats(result, 'Shared Hit Blocks'),
                'shared_read_blocks': self._extract_buffer_stats(result, 'Shared Read Blocks'),
                'query_plan': result['Plan']
            }
    
    def suggest_indexes(self, slow_queries: List[str]) -> List[str]:
        """Analyze multiple queries and suggest indexes"""
        suggestions = []
        
        for query in slow_queries:
            analysis = self.analyze_query(query)
            
            # Look for sequential scans on large tables
            if self._has_seq_scan(analysis['query_plan']):
                suggestions.append(f"-- Seq scan detected in: {query[:50]}...")
                suggestions.append("-- Consider adding index on filtered columns")
                
            # Check for high buffer reads
            if analysis['shared_read_blocks'] > 1000:
                suggestions.append(f"-- High disk I/O detected: {analysis['shared_read_blocks']} blocks")
                suggestions.append("-- Consider creating covering index")
                
        return suggestions`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/postgres-optimize.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 48
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.85,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  {
    id: 'CODE:POSTGRES:TRANSACTION_SAFE',
    type: 'CODEBASE',
    title: 'ACID-Compliant Transaction Management with Deadlock Prevention',
    summary: 'Implements robust transaction handling with proper isolation levels, consistent lock ordering, and automatic retry logic',
    snippets: [
      {
        snippet_id: 'pg-trans-1',
        language: 'sql',
        content: `-- Transaction template with proper lock ordering and error handling
BEGIN ISOLATION LEVEL READ COMMITTED;

-- Always acquire locks in consistent order to prevent deadlocks
-- Rule: Lock tables in alphabetical order, lock lower IDs before higher IDs

-- Example: Transfer between accounts (deadlock-prone operation)
DO $$
DECLARE
    from_account_id BIGINT := 1001;
    to_account_id BIGINT := 1002;
    transfer_amount DECIMAL(10,2) := 100.00;
    from_balance DECIMAL(10,2);
    temp_id BIGINT;
BEGIN
    -- Ensure consistent lock ordering by ID
    IF from_account_id > to_account_id THEN
        temp_id := from_account_id;
        from_account_id := to_account_id;
        to_account_id := temp_id;
        transfer_amount := -transfer_amount;
    END IF;
    
    -- Lock accounts in consistent order with FOR UPDATE
    SELECT balance INTO from_balance 
    FROM accounts 
    WHERE id = from_account_id 
    FOR UPDATE;
    
    SELECT balance INTO STRICT from_balance 
    FROM accounts 
    WHERE id = to_account_id 
    FOR UPDATE;
    
    -- Validate business rules
    IF from_balance < ABS(transfer_amount) THEN
        RAISE EXCEPTION 'Insufficient funds: % < %', from_balance, ABS(transfer_amount);
    END IF;
    
    -- Perform atomic updates
    UPDATE accounts 
    SET balance = balance - ABS(transfer_amount),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = LEAST(from_account_id, to_account_id);
    
    UPDATE accounts 
    SET balance = balance + ABS(transfer_amount),
        updated_at = CURRENT_TIMESTAMP  
    WHERE id = GREATEST(from_account_id, to_account_id);
    
    -- Log transaction
    INSERT INTO transaction_log (from_account, to_account, amount, timestamp)
    VALUES (from_account_id, to_account_id, transfer_amount, CURRENT_TIMESTAMP);
    
    COMMIT;
    
EXCEPTION
    WHEN serialization_failure OR deadlock_detected THEN
        ROLLBACK;
        RAISE NOTICE 'Transaction failed due to deadlock, should retry';
        RAISE;
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE NOTICE 'Transaction failed: %', SQLERRM;
        RAISE;
END $$;`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/postgres-transaction.sql',
          sha: CURRENT_SHA,
          start: 1,
          end: 65
        }
      },
      {
        snippet_id: 'pg-trans-2',
        language: 'python',
        content: `import psycopg2
import time
import random
from contextlib import contextmanager
from typing import Callable, Any
import logging

class TransactionManager:
    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self.logger = logging.getLogger(__name__)
        
    @contextmanager
    def get_connection(self):
        """Context manager for database connections"""
        conn = psycopg2.connect(self.connection_string)
        try:
            yield conn
        finally:
            conn.close()
    
    def execute_with_retry(self, 
                          transaction_func: Callable, 
                          max_retries: int = 3,
                          isolation_level: str = 'READ COMMITTED') -> Any:
        """
        Execute transaction with automatic retry for deadlocks and serialization failures
        """
        for attempt in range(max_retries):
            try:
                with self.get_connection() as conn:
                    with conn.cursor() as cursor:
                        # Set isolation level
                        conn.set_isolation_level(
                            getattr(psycopg2.extensions, f'ISOLATION_LEVEL_{isolation_level.replace(" ", "_")}')
                        )
                        
                        # Execute transaction function
                        result = transaction_func(cursor)
                        conn.commit()
                        
                        self.logger.info(f"Transaction succeeded on attempt {attempt + 1}")
                        return result
                        
            except psycopg2.Error as e:
                conn.rollback()
                
                # Check for retryable errors
                if e.pgcode in ('40001', '40P01'):  # serialization_failure, deadlock_detected
                    if attempt < max_retries - 1:
                        # Exponential backoff with jitter
                        sleep_time = (2 ** attempt) + random.uniform(0, 1)
                        self.logger.warning(
                            f"Retryable error on attempt {attempt + 1}: {e.pgcode} - {e.pgerror}. "
                            f"Retrying in {sleep_time:.2f}s"
                        )
                        time.sleep(sleep_time)
                        continue
                    else:
                        self.logger.error(f"Transaction failed after {max_retries} attempts")
                        raise
                else:
                    # Non-retryable error
                    self.logger.error(f"Non-retryable error: {e.pgcode} - {e.pgerror}")
                    raise
        
        raise Exception(f"Transaction failed after {max_retries} attempts")`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/postgres-transaction.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 65
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.9,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  // Additional useful patterns
  {
    id: 'CODE:DOCKER:MULTI_STAGE',
    type: 'CODEBASE',
    title: 'Multi-Stage Docker Builds for Production',
    summary: 'Create optimized Docker images using multi-stage builds to reduce image size and improve security',
    snippets: [
      {
        snippet_id: 'docker-multi-1',
        language: 'dockerfile',
        content: `# Multi-stage Dockerfile for Node.js application
# Stage 1: Build stage
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Stage 2: Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]`,
        source_ref: {
          kind: 'git_lines',
          file: 'Dockerfile',
          sha: CURRENT_SHA,
          start: 1,
          end: 48
        }
      },
      {
        snippet_id: 'docker-multi-2',
        language: 'dockerfile',
        content: `# Multi-stage Dockerfile for Python application
# Stage 1: Build stage
FROM python:3.11-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Create virtual environment and install dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Production stage
FROM python:3.11-slim AS production

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1001 appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY --chown=appuser:appuser . .

# Set environment variables
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')"

# Run the application
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", "app:application"]`,
        source_ref: {
          kind: 'git_lines',
          file: 'Dockerfile.python',
          sha: CURRENT_SHA,
          start: 1,
          end: 53
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.9,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  {
    id: 'TEST:REACT:COMPONENT_TESTING',
    type: 'CODEBASE',
    title: 'React Component Testing with Testing Library',
    summary: 'Comprehensive testing patterns for React components using Testing Library with accessibility and user interaction focus',
    snippets: [
      {
        snippet_id: 'react-test-1',
        language: 'javascript',
        content: `import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import '@testing-library/jest-dom';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

describe('UserForm Component', () => {
  // Setup user event instance for each test
  let user;
  
  beforeEach(() => {
    user = userEvent.setup();
  });

  test('renders form with proper accessibility', async () => {
    const { container } = render(<UserForm />);
    
    // Check accessibility
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    
    // Check form elements by accessible roles
    expect(screen.getByRole('form', { name: /user registration/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /full name/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  test('validates form inputs on blur', async () => {
    render(<UserForm />);
    
    const emailInput = screen.getByRole('textbox', { name: /email/i });
    
    // Type invalid email
    await user.type(emailInput, 'invalid-email');
    await user.tab(); // Blur the input
    
    // Check for error message
    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
    });
    
    // Fix the email
    await user.clear(emailInput);
    await user.type(emailInput, 'user@example.com');
    await user.tab();
    
    // Error should disappear
    await waitFor(() => {
      expect(screen.queryByText(/please enter a valid email/i)).not.toBeInTheDocument();
    });
  });

  test('submits form with valid data', async () => {
    const onSubmit = jest.fn();
    render(<UserForm onSubmit={onSubmit} />);
    
    // Fill form
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');
    await user.type(screen.getByRole('textbox', { name: /full name/i }), 'John Doe');
    await user.selectOptions(screen.getByRole('combobox', { name: /country/i }), 'US');
    await user.click(screen.getByRole('checkbox', { name: /terms/i }));
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /submit/i }));
    
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        fullName: 'John Doe',
        country: 'US',
        acceptedTerms: true
      });
    });
  });

  test('displays loading state during submission', async () => {
    const onSubmit = jest.fn(() => new Promise(resolve => setTimeout(resolve, 1000)));
    render(<UserForm onSubmit={onSubmit} />);
    
    // Fill minimum required fields
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');
    
    // Submit
    const submitButton = screen.getByRole('button', { name: /submit/i });
    await user.click(submitButton);
    
    // Check loading state
    expect(submitButton).toBeDisabled();
    expect(within(submitButton).getByText(/submitting/i)).toBeInTheDocument();
    
    // Wait for submission to complete
    await waitFor(() => {
      expect(submitButton).toBeEnabled();
      expect(within(submitButton).getByText(/submit/i)).toBeInTheDocument();
    });
  });
});`,
        source_ref: {
          kind: 'git_lines',
          file: 'tests/UserForm.test.js',
          sha: CURRENT_SHA,
          start: 1,
          end: 90
        }
      },
      {
        snippet_id: 'react-test-2',
        language: 'javascript',
        content: `// Custom render function with providers
import { render } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';

// Create a custom render function
function renderWithProviders(
  ui,
  {
    initialRoute = '/',
    theme = defaultTheme,
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    }),
    ...renderOptions
  } = {}
) {
  function Wrapper({ children }) {
    return (
      <MemoryRouter initialEntries={[initialRoute]}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={theme}>
            {children}
          </ThemeProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  
  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient
  };
}

// Testing async data fetching
test('loads and displays user data', async () => {
  const mockUser = { id: 1, name: 'John Doe', email: 'john@example.com' };
  
  // Mock API call
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockUser)
    })
  );
  
  const { queryClient } = renderWithProviders(<UserProfile userId={1} />);
  
  // Check loading state
  expect(screen.getByText(/loading user/i)).toBeInTheDocument();
  
  // Wait for data to load
  await waitFor(() => {
    expect(screen.getByText(mockUser.name)).toBeInTheDocument();
  });
  
  // Verify API was called correctly
  expect(global.fetch).toHaveBeenCalledWith('/api/users/1');
  
  // Check cache
  const cachedData = queryClient.getQueryData(['user', 1]);
  expect(cachedData).toEqual(mockUser);
});

// Testing error states
test('displays error message on fetch failure', async () => {
  // Mock failed API call
  global.fetch = jest.fn(() =>
    Promise.reject(new Error('Network error'))
  );
  
  renderWithProviders(<UserProfile userId={1} />);
  
  await waitFor(() => {
    expect(screen.getByText(/failed to load user/i)).toBeInTheDocument();
  });
  
  // Test retry functionality
  const retryButton = screen.getByRole('button', { name: /retry/i });
  await userEvent.click(retryButton);
  
  expect(global.fetch).toHaveBeenCalledTimes(2);
});`,
        source_ref: {
          kind: 'git_lines',
          file: 'tests/test-utils.js',
          sha: CURRENT_SHA,
          start: 1,
          end: 82
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.85,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  {
    id: 'SEC:API:RATE_LIMITING',
    type: 'CODEBASE',
    title: 'API Rate Limiting Implementation',
    summary: 'Implement rate limiting to prevent API abuse with configurable limits, Redis backing, and proper headers',
    snippets: [
      {
        snippet_id: 'rate-limit-1',
        language: 'javascript',
        content: `import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

// Redis client for rate limiting
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  enableOfflineQueue: false
});

// Create flexible rate limiter factory
function createRateLimiter(options = {}) {
  const defaults = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit headers
    
    // Redis store for distributed rate limiting
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:',
    }),
    
    // Custom key generator
    keyGenerator: (req) => {
      // Use authenticated user ID if available, otherwise IP
      return req.user?.id || req.ip;
    },
    
    // Skip successful requests from rate limiting
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    
    // Custom handler for rate limit exceeded
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too many requests',
        message: 'You have exceeded the rate limit. Please try again later.',
        retryAfter: Math.round(req.rateLimit.resetTime / 1000) || 60
      });
    },
    
    // Custom skip logic
    skip: (req) => {
      // Skip rate limiting for whitelisted IPs
      const whitelist = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];
      return whitelist.includes(req.ip);
    }
  };
  
  return rateLimit({ ...defaults, ...options });
}

// Different limiters for different endpoints
export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});

export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Strict limit for auth endpoints
  skipSuccessfulRequests: true // Don't count successful logins
});

export const apiLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60 // 1 request per second on average
});

// Implement sliding window rate limiting
export const slidingWindowLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  // Use sliding window algorithm
  store: new RedisStore({
    client: redisClient,
    prefix: 'sw:',
    sendCommand: (...args) => redisClient.call(...args),
  }),
});

// Usage in Express app
app.use('/api/', apiLimiter);
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.post('/api/heavy-operation', slidingWindowLimiter, heavyOperationHandler);`,
        source_ref: {
          kind: 'git_lines',
          file: 'middleware/rate-limit.js',
          sha: CURRENT_SHA,
          start: 1,
          end: 85
        }
      },
      {
        snippet_id: 'rate-limit-2',
        language: 'python',
        content: `from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
import redis
import time
import hashlib
from typing import Optional, Dict, Any
import asyncio
from datetime import datetime, timedelta

class RateLimiter:
    """Token bucket rate limiter with Redis backend"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.lua_script = """
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local tokens = tonumber(ARGV[2])
        local fill_time = tonumber(ARGV[3])
        local ttl = tonumber(ARGV[4])
        
        local bucket = redis.call('HMGET', key, 'tokens', 'last_update')
        local current_tokens = tonumber(bucket[1]) or capacity
        local last_update = tonumber(bucket[2]) or 0
        
        local now = tonumber(ARGV[5])
        local elapsed = math.max(0, now - last_update)
        
        -- Calculate new tokens (token bucket algorithm)
        local filled_tokens = math.floor(elapsed / fill_time)
        current_tokens = math.min(capacity, current_tokens + filled_tokens)
        
        if current_tokens < tokens then
            return {0, current_tokens, capacity}
        end
        
        -- Consume tokens
        current_tokens = current_tokens - tokens
        redis.call('HMSET', key, 'tokens', current_tokens, 'last_update', now)
        redis.call('EXPIRE', key, ttl)
        
        return {1, current_tokens, capacity}
        """
        self.script_sha = self.redis.script_load(self.lua_script)
    
    async def check_rate_limit(
        self,
        key: str,
        capacity: int = 60,
        tokens_requested: int = 1,
        fill_rate: float = 1.0,  # tokens per second
        ttl: int = 3600
    ) -> Dict[str, Any]:
        """Check if request is within rate limit"""
        try:
            now = time.time()
            fill_time = 1.0 / fill_rate
            
            result = self.redis.evalsha(
                self.script_sha,
                1,  # number of keys
                key,  # KEYS[1]
                capacity,  # ARGV[1]
                tokens_requested,  # ARGV[2]
                fill_time,  # ARGV[3]
                ttl,  # ARGV[4]
                now  # ARGV[5]
            )
            
            allowed, remaining, total = result
            
            return {
                'allowed': bool(allowed),
                'remaining': int(remaining),
                'total': int(total),
                'reset_after': fill_time * (total - remaining)
            }
            
        except redis.RedisError as e:
            # Fallback to allow request on Redis failure
            print(f"Redis error in rate limiter: {e}")
            return {'allowed': True, 'remaining': -1, 'total': capacity}

# FastAPI middleware
async def rate_limit_middleware(
    request: Request,
    call_next,
    limiter: RateLimiter,
    capacity: int = 100,
    fill_rate: float = 100/60  # 100 requests per minute
):
    # Generate rate limit key
    client_id = request.client.host
    if hasattr(request.state, "user"):
        client_id = f"user:{request.state.user.id}"
    
    key = f"rate_limit:{request.url.path}:{client_id}"
    
    # Check rate limit
    result = await limiter.check_rate_limit(key, capacity, 1, fill_rate)
    
    # Add rate limit headers
    response = await call_next(request) if result['allowed'] else None
    
    if not result['allowed']:
        response = JSONResponse(
            status_code=429,
            content={
                "error": "Rate limit exceeded",
                "retry_after": int(result['reset_after'])
            }
        )
    
    # Add rate limit headers
    response.headers['X-RateLimit-Limit'] = str(result['total'])
    response.headers['X-RateLimit-Remaining'] = str(max(0, result['remaining']))
    response.headers['X-RateLimit-Reset'] = str(int(time.time() + result['reset_after']))
    
    return response

# Usage in FastAPI
app = FastAPI()
redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)
rate_limiter = RateLimiter(redis_client)

# Apply rate limiting to specific endpoints
@app.post("/api/expensive-operation")
async def expensive_operation(request: Request):
    # Custom rate limit for expensive operations
    result = await rate_limiter.check_rate_limit(
        f"expensive:{request.client.host}",
        capacity=10,  # 10 requests
        tokens_requested=1,
        fill_rate=10/3600  # 10 per hour
    )
    
    if not result['allowed']:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded for expensive operations"
        )
    
    # Perform expensive operation
    return {"status": "completed"}`,
        source_ref: {
          kind: 'git_lines',
          file: 'middleware/rate_limit.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 140
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.9,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  {
    id: 'CODE:NEXTJS:API_ROUTES',
    type: 'CODEBASE',
    title: 'Next.js API Routes with TypeScript',
    summary: 'Create type-safe Next.js API routes with proper error handling, validation, and middleware support',
    snippets: [
      {
        snippet_id: 'nextjs-api-1',
        language: 'typescript',
        content: `// pages/api/users/[id].ts - Dynamic API route with TypeScript
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import { withValidation } from '@/middleware/validation';
import { ApiError, withErrorHandler } from '@/lib/api-error';

// Request/Response types
interface AuthenticatedRequest extends NextApiRequest {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

type UserResponse = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
} | { error: string };

// Validation schemas
const paramsSchema = z.object({
  id: z.string().uuid('Invalid user ID format')
});

const updateBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  bio: z.string().max(500).optional()
});

// Main handler
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<UserResponse>
) {
  const { id } = paramsSchema.parse(req.query);
  
  switch (req.method) {
    case 'GET':
      return handleGet(req, res, id);
    case 'PUT':
      return handleUpdate(req, res, id);
    case 'DELETE':
      return handleDelete(req, res, id);
    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      throw new ApiError(405, \`Method \${req.method} not allowed\`);
  }
}

async function handleGet(
  req: AuthenticatedRequest,
  res: NextApiResponse<UserResponse>,
  userId: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true
    }
  });
  
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  // Check permissions
  if (user.id !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'Access denied');
  }
  
  res.status(200).json({
    ...user,
    createdAt: user.createdAt.toISOString()
  });
}

async function handleUpdate(
  req: AuthenticatedRequest,
  res: NextApiResponse<UserResponse>,
  userId: string
) {
  // Validate request body
  const data = updateBodySchema.parse(req.body);
  
  // Check permissions
  if (userId !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'Cannot update other users');
  }
  
  // Update user
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true
    }
  });
  
  res.status(200).json({
    ...updatedUser,
    createdAt: updatedUser.createdAt.toISOString()
  });
}

async function handleDelete(
  req: AuthenticatedRequest,
  res: NextApiResponse<{ success: boolean }>,
  userId: string
) {
  // Only admins can delete users
  if (req.user.role !== 'admin') {
    throw new ApiError(403, 'Admin access required');
  }
  
  await prisma.user.delete({
    where: { id: userId }
  });
  
  res.status(200).json({ success: true });
}

// Export with middleware chain
export default withErrorHandler(
  withAuth(
    withValidation(handler)
  )
);`,
        source_ref: {
          kind: 'git_lines',
          file: 'pages/api/users/[id].ts',
          sha: CURRENT_SHA,
          start: 1,
          end: 130
        }
      },
      {
        snippet_id: 'nextjs-api-2',
        language: 'typescript',
        content: `// lib/api-middleware.ts - Reusable API middleware
import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { verify } from 'jsonwebtoken';
import { z } from 'zod';
import Cors from 'cors';
import { RateLimiter } from './rate-limiter';

// Initialize middleware
const cors = Cors({
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
});

const rateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // requests per window
});

// Helper to run middleware
function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: Function
) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

// Auth middleware
export function withAuth(handler: NextApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }
      
      const decoded = verify(token, process.env.JWT_SECRET!) as any;
      (req as any).user = decoded;
      
      return handler(req, res);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

// Validation middleware
export function withValidation<T extends z.ZodType>(
  schema: T,
  property: 'body' | 'query' = 'body'
) {
  return (handler: NextApiHandler) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      try {
        const validated = await schema.parseAsync(req[property]);
        req[property] = validated;
        return handler(req, res);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            error: 'Validation error',
            details: error.errors
          });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    };
  };
}

// CORS middleware
export function withCors(handler: NextApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    await runMiddleware(req, res, cors);
    return handler(req, res);
  };
}

// Rate limiting middleware
export function withRateLimit(options?: any) {
  const limiter = options ? new RateLimiter(options) : rateLimiter;
  
  return (handler: NextApiHandler) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      const identifier = (req as any).user?.id || req.headers['x-forwarded-for'] || 'anonymous';
      const { allowed, remaining } = await limiter.check(identifier);
      
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      
      if (!allowed) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      
      return handler(req, res);
    };
  };
}

// Error handling wrapper
export function withErrorHandler(handler: NextApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handler(req, res);
    } catch (error: any) {
      console.error('API Error:', error);
      
      // Handle known error types
      if (error.name === 'PrismaClientKnownRequestError') {
        if (error.code === 'P2002') {
          return res.status(409).json({ error: 'Resource already exists' });
        }
        if (error.code === 'P2025') {
          return res.status(404).json({ error: 'Resource not found' });
        }
      }
      
      // Default error response
      const statusCode = error.statusCode || 500;
      const message = error.message || 'Internal server error';
      
      res.status(statusCode).json({ error: message });
    }
  };
}

// Compose multiple middleware
export function compose(...middleware: Function[]) {
  return (handler: NextApiHandler) => {
    return middleware.reduceRight((prev, curr) => curr(prev), handler);
  };
}`,
        source_ref: {
          kind: 'git_lines',
          file: 'lib/api-middleware.ts',
          sha: CURRENT_SHA,
          start: 1,
          end: 140
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.85,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  {
    id: 'TEST:PYTEST:FIXTURE_SETUP',
    type: 'CODEBASE',
    title: 'Python Test Fixtures with Pytest',
    summary: 'Create reusable test fixtures for database setup, mocking, and test data generation with proper cleanup',
    snippets: [
      {
        snippet_id: 'pytest-fixture-1',
        language: 'python',
        content: `import pytest
import asyncio
from datetime import datetime
from typing import Generator, AsyncGenerator
import asyncpg
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from faker import Faker
import factory

# Test database setup
@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def test_db_url():
    """Create a test database and return connection URL."""
    # Connect to postgres to create test database
    conn = await asyncpg.connect(
        host="localhost",
        port=5432,
        user="postgres",
        password="postgres",
        database="postgres"
    )
    
    test_db_name = f"test_db_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    try:
        await conn.execute(f"CREATE DATABASE {test_db_name}")
        yield f"postgresql+asyncpg://postgres:postgres@localhost:5432/{test_db_name}"
    finally:
        # Cleanup
        await conn.execute(f"DROP DATABASE IF EXISTS {test_db_name}")
        await conn.close()

@pytest.fixture(scope="session")
async def engine(test_db_url):
    """Create async SQLAlchemy engine."""
    engine = create_async_engine(test_db_url, echo=False)
    
    async with engine.begin() as conn:
        # Run migrations or create tables
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    await engine.dispose()

@pytest.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a new database session for a test."""
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        yield session
        await session.rollback()

# Factory fixtures for test data
class UserFactory(factory.Factory):
    class Meta:
        model = dict
    
    id = factory.Faker("uuid4")
    email = factory.Faker("email")
    username = factory.LazyAttribute(lambda obj: obj.email.split('@')[0])
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    is_active = True
    created_at = factory.Faker("date_time")

@pytest.fixture
def user_factory():
    """Factory for creating user test data."""
    return UserFactory

@pytest.fixture
async def test_user(db_session, user_factory):
    """Create a test user in the database."""
    user_data = user_factory()
    user = User(**user_data)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user

@pytest.fixture
async def authenticated_user(test_user):
    """Create an authenticated user with JWT token."""
    from app.auth import create_access_token
    
    token = create_access_token({"sub": str(test_user.id)})
    return {
        "user": test_user,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"}
    }

# Mock fixtures
@pytest.fixture
def mock_redis(mocker):
    """Mock Redis client."""
    mock = mocker.MagicMock()
    mock.get.return_value = None
    mock.set.return_value = True
    mock.delete.return_value = True
    mock.exists.return_value = False
    return mock

@pytest.fixture
def mock_email_service(mocker):
    """Mock email service."""
    mock = mocker.patch("app.services.email.send_email")
    mock.return_value = {"id": "msg_123", "status": "sent"}
    return mock

# Parametrized fixtures
@pytest.fixture(params=["admin", "user", "guest"])
def user_role(request):
    """Parametrized fixture for different user roles."""
    return request.param

@pytest.fixture
async def user_with_role(db_session, user_factory, user_role):
    """Create users with different roles."""
    user_data = user_factory()
    user_data["role"] = user_role
    user = User(**user_data)
    db_session.add(user)
    await db_session.commit()
    return user`,
        source_ref: {
          kind: 'git_lines',
          file: 'tests/conftest.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 135
        }
      },
      {
        snippet_id: 'pytest-fixture-2',
        language: 'python',
        content: `# Advanced fixture patterns
import pytest
from unittest.mock import AsyncMock, patch
import httpx
from typing import Dict, Any

# HTTP client fixtures
@pytest.fixture
async def http_client():
    """Create async HTTP client for testing."""
    async with httpx.AsyncClient() as client:
        yield client

@pytest.fixture
def api_client(http_client, authenticated_user):
    """Create authenticated API client."""
    class AuthenticatedClient:
        def __init__(self, client, headers):
            self.client = client
            self.headers = headers
        
        async def get(self, url: str, **kwargs) -> httpx.Response:
            kwargs.setdefault("headers", {}).update(self.headers)
            return await self.client.get(url, **kwargs)
        
        async def post(self, url: str, **kwargs) -> httpx.Response:
            kwargs.setdefault("headers", {}).update(self.headers)
            return await self.client.post(url, **kwargs)
        
        async def put(self, url: str, **kwargs) -> httpx.Response:
            kwargs.setdefault("headers", {}).update(self.headers)
            return await self.client.put(url, **kwargs)
        
        async def delete(self, url: str, **kwargs) -> httpx.Response:
            kwargs.setdefault("headers", {}).update(self.headers)
            return await self.client.delete(url, **kwargs)
    
    return AuthenticatedClient(http_client, authenticated_user["headers"])

# Fixture for testing with different database states
@pytest.fixture
async def populated_db(db_session, user_factory):
    """Populate database with test data."""
    users = []
    for i in range(10):
        user_data = user_factory()
        user = User(**user_data)
        users.append(user)
        db_session.add(user)
    
    await db_session.commit()
    
    # Create relationships
    for i in range(5):
        post = Post(
            title=f"Test Post {i}",
            content="Lorem ipsum dolor sit amet",
            author_id=users[i % len(users)].id
        )
        db_session.add(post)
    
    await db_session.commit()
    
    return {"users": users, "posts": await db_session.query(Post).all()}

# Fixture with cleanup
@pytest.fixture
async def temp_file_upload():
    """Handle temporary file uploads with cleanup."""
    import tempfile
    import os
    
    files = []
    
    def create_upload_file(content: bytes, filename: str = "test.txt"):
        # Create temporary file
        fd, path = tempfile.mkstemp()
        with os.fdopen(fd, 'wb') as tmp:
            tmp.write(content)
        
        files.append(path)
        
        return {
            "file": open(path, 'rb'),
            "filename": filename,
            "content_type": "application/octet-stream"
        }
    
    yield create_upload_file
    
    # Cleanup
    for file_path in files:
        try:
            os.unlink(file_path)
        except Exception:
            pass

# Fixture for mocking external APIs
@pytest.fixture
def mock_external_api():
    """Mock external API calls."""
    with patch("app.services.external_api.client") as mock:
        # Setup default responses
        mock.get_user.return_value = {
            "id": "ext_123",
            "email": "external@example.com",
            "verified": True
        }
        
        mock.create_payment.return_value = {
            "payment_id": "pay_123",
            "status": "pending",
            "amount": 1000
        }
        
        yield mock

# Composite fixture
@pytest.fixture
async def complete_test_environment(
    db_session,
    populated_db,
    authenticated_user,
    mock_redis,
    mock_email_service,
    mock_external_api
):
    """Set up complete test environment."""
    return {
        "db": db_session,
        "data": populated_db,
        "auth": authenticated_user,
        "redis": mock_redis,
        "email": mock_email_service,
        "external_api": mock_external_api
    }

# Usage in tests
@pytest.mark.asyncio
async def test_create_post_with_fixtures(api_client, complete_test_environment):
    """Example test using composite fixtures."""
    response = await api_client.post(
        "/api/posts",
        json={
            "title": "Test Post",
            "content": "This is a test post"
        }
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Post"
    
    # Verify email was sent
    complete_test_environment["email"].assert_called_once()`,
        source_ref: {
          kind: 'git_lines',
          file: 'tests/fixtures/advanced.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 160
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.85,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  {
    id: 'SEC:VALIDATION:INPUT_SANITIZATION',
    type: 'CODEBASE',
    title: 'Input Validation and Sanitization',
    summary: 'Comprehensive input validation and sanitization to prevent injection attacks and ensure data integrity',
    snippets: [
      {
        snippet_id: 'validation-1',
        language: 'javascript',
        content: `import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

// Zod schemas for type-safe validation
const userInputSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .transform(val => val.toLowerCase().trim()),
  
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
    .transform(val => val.trim()),
  
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  
  bio: z.string()
    .max(500, 'Bio must be at most 500 characters')
    .transform(val => DOMPurify.sanitize(val, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong'] }))
    .optional(),
  
  website: z.string()
    .url('Invalid URL format')
    .refine(val => {
      const url = new URL(val);
      return ['http:', 'https:'].includes(url.protocol);
    }, 'Only HTTP(S) URLs are allowed')
    .optional(),
  
  age: z.number()
    .int('Age must be a whole number')
    .min(13, 'Must be at least 13 years old')
    .max(120, 'Invalid age'),
  
  tags: z.array(
    z.string()
      .min(1)
      .max(20)
      .regex(/^[a-zA-Z0-9]+$/, 'Tags can only contain alphanumeric characters')
  ).max(10, 'Maximum 10 tags allowed')
});

// SQL injection prevention helper
export function sanitizeSQLIdentifier(identifier: string): string {
  // Only allow alphanumeric characters and underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error('Invalid SQL identifier');
  }
  return identifier;
}

// File upload validation
export const fileUploadSchema = z.object({
  filename: z.string()
    .min(1)
    .max(255)
    .transform(val => {
      // Sanitize filename
      return val.replace(/[^a-zA-Z0-9.-_]/g, '_');
    }),
  
  mimetype: z.enum([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv'
  ], {
    errorMap: () => ({ message: 'File type not allowed' })
  }),
  
  size: z.number()
    .max(10 * 1024 * 1024, 'File size must be less than 10MB')
});

// XSS prevention for user-generated content
export function sanitizeHTML(html: string, options = {}): string {
  const defaultOptions = {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
  };
  
  return DOMPurify.sanitize(html, { ...defaultOptions, ...options });
}

// Command injection prevention
export function sanitizeShellArg(arg: string): string {
  // Escape shell metacharacters
  return arg.replace(/(["\s'$\`\\])/g, '\\$1');
}

// Path traversal prevention
export function sanitizePath(userPath: string, basePath: string): string {
  const path = require('path');
  
  // Resolve to absolute path
  const resolvedPath = path.resolve(basePath, userPath);
  
  // Ensure the resolved path is within the base path
  if (!resolvedPath.startsWith(path.resolve(basePath))) {
    throw new Error('Path traversal attempt detected');
  }
  
  return resolvedPath;
}

// MongoDB injection prevention
export function sanitizeMongoQuery(query: any): any {
  if (typeof query !== 'object' || query === null) {
    return query;
  }
  
  const sanitized: any = Array.isArray(query) ? [] : {};
  
  for (const key in query) {
    if (key.startsWith('$')) {
      throw new Error('MongoDB operator in user input');
    }
    
    if (typeof query[key] === 'object') {
      sanitized[key] = sanitizeMongoQuery(query[key]);
    } else {
      sanitized[key] = query[key];
    }
  }
  
  return sanitized;
}

// Express middleware for validation
export function validateRequest(schema: z.ZodSchema) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });
      
      // Replace request data with validated data
      req.body = validated.body || {};
      req.query = validated.query || {};
      req.params = validated.params || {};
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      next(error);
    }
  };
}`,
        source_ref: {
          kind: 'git_lines',
          file: 'lib/validation.js',
          sha: CURRENT_SHA,
          start: 1,
          end: 140
        }
      },
      {
        snippet_id: 'validation-2',
        language: 'python',
        content: `from typing import Any, Dict, List, Optional
import re
import html
import bleach
from pydantic import BaseModel, EmailStr, HttpUrl, validator, Field
from email_validator import validate_email, EmailNotValidError
import phonenumbers
from datetime import datetime, date
import magic

# Pydantic models for validation
class UserInput(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=20, regex=r'^[a-zA-Z0-9_-]+$')
    password: str = Field(..., min_length=8)
    phone: Optional[str] = None
    bio: Optional[str] = Field(None, max_length=500)
    website: Optional[HttpUrl] = None
    date_of_birth: Optional[date] = None
    
    @validator('email')
    def validate_email_deliverability(cls, v):
        """Validate email with DNS checking."""
        try:
            validation = validate_email(v, check_deliverability=True)
            return validation.email
        except EmailNotValidError as e:
            raise ValueError(str(e))
    
    @validator('password')
    def validate_password_strength(cls, v):
        """Ensure password meets security requirements."""
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain number')
        if not re.search(r'[^A-Za-z0-9]', v):
            raise ValueError('Password must contain special character')
        return v
    
    @validator('phone')
    def validate_phone_number(cls, v):
        """Validate international phone numbers."""
        if v is None:
            return v
        try:
            parsed = phonenumbers.parse(v, None)
            if not phonenumbers.is_valid_number(parsed):
                raise ValueError('Invalid phone number')
            # Return formatted number
            return phonenumbers.format_number(
                parsed, 
                phonenumbers.PhoneNumberFormat.E164
            )
        except phonenumbers.NumberParseException:
            raise ValueError('Invalid phone number format')
    
    @validator('bio')
    def sanitize_bio(cls, v):
        """Sanitize HTML in bio."""
        if v is None:
            return v
        # Allow only safe HTML tags
        allowed_tags = ['b', 'i', 'u', 'strong', 'em', 'p', 'br']
        allowed_attrs = {}
        return bleach.clean(v, tags=allowed_tags, attributes=allowed_attrs, strip=True)
    
    @validator('date_of_birth')
    def validate_age(cls, v):
        """Ensure user is at least 13 years old."""
        if v is None:
            return v
        age = (date.today() - v).days // 365
        if age < 13:
            raise ValueError('Must be at least 13 years old')
        if age > 120:
            raise ValueError('Invalid date of birth')
        return v

# SQL injection prevention
def sanitize_sql_identifier(identifier: str) -> str:
    """Sanitize SQL identifiers to prevent injection."""
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', identifier):
        raise ValueError(f"Invalid SQL identifier: {identifier}")
    return identifier

def build_safe_query(table: str, columns: List[str], conditions: Dict[str, Any]) -> tuple:
    """Build parameterized query safely."""
    table = sanitize_sql_identifier(table)
    columns = [sanitize_sql_identifier(col) for col in columns]
    
    where_clauses = []
    params = []
    
    for col, value in conditions.items():
        col = sanitize_sql_identifier(col)
        where_clauses.append(f"{col} = %s")
        params.append(value)
    
    query = f"SELECT {', '.join(columns)} FROM {table}"
    if where_clauses:
        query += f" WHERE {' AND '.join(where_clauses)}"
    
    return query, params

# File upload validation
class FileUpload(BaseModel):
    filename: str = Field(..., max_length=255)
    content_type: str
    size: int = Field(..., le=10 * 1024 * 1024)  # 10MB max
    
    @validator('filename')
    def sanitize_filename(cls, v):
        """Sanitize filename to prevent directory traversal."""
        # Remove any directory components
        v = os.path.basename(v)
        # Replace potentially dangerous characters
        v = re.sub(r'[^a-zA-Z0-9._-]', '_', v)
        # Ensure it has a proper extension
        if '.' not in v:
            v += '.bin'
        return v
    
    @validator('content_type')
    def validate_mime_type(cls, v, values):
        """Validate MIME type against file content."""
        allowed_types = {
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png'],
            'image/gif': ['.gif'],
            'application/pdf': ['.pdf'],
            'text/plain': ['.txt'],
            'text/csv': ['.csv']
        }
        
        if v not in allowed_types:
            raise ValueError(f"File type {v} not allowed")
        
        # Verify extension matches MIME type
        if 'filename' in values:
            ext = os.path.splitext(values['filename'])[1].lower()
            if ext not in allowed_types[v]:
                raise ValueError(f"File extension {ext} doesn't match MIME type {v}")
        
        return v

def validate_file_content(file_path: str, expected_type: str) -> bool:
    """Validate file content matches expected type using python-magic."""
    mime = magic.Magic(mime=True)
    detected_type = mime.from_file(file_path)
    
    # Allow some flexibility for similar types
    type_mappings = {
        'image/jpeg': ['image/jpeg', 'image/jpg'],
        'text/plain': ['text/plain', 'text/x-python', 'text/x-c'],
    }
    
    allowed_types = type_mappings.get(expected_type, [expected_type])
    return detected_type in allowed_types

# NoSQL injection prevention
def sanitize_mongodb_input(data: Any) -> Any:
    """Recursively sanitize MongoDB queries to prevent injection."""
    if isinstance(data, dict):
        sanitized = {}
        for key, value in data.items():
            # Reject keys starting with $ (MongoDB operators)
            if isinstance(key, str) and key.startswith('$'):
                raise ValueError(f"Potential MongoDB injection: {key}")
            sanitized[key] = sanitize_mongodb_input(value)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_mongodb_input(item) for item in data]
    elif isinstance(data, str):
        # Escape special regex characters if used in regex operations
        return re.escape(data) if '$regex' in str(data) else data
    else:
        return data

# Command injection prevention
import shlex
import subprocess

def safe_subprocess_run(command: List[str], user_input: str = None) -> subprocess.CompletedProcess:
    """Run subprocess command safely with user input."""
    if user_input:
        # Use shlex to safely quote the input
        safe_input = shlex.quote(user_input)
        command = [arg.replace('{}', safe_input) for arg in command]
    
    # Never use shell=True with user input
    return subprocess.run(
        command,
        shell=False,
        capture_output=True,
        text=True,
        timeout=30  # Prevent DoS
    )`,
        source_ref: {
          kind: 'git_lines',
          file: 'lib/validation.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 200
        }
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.9,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  }
];

// Function to insert new patterns
function insertNewPatterns() {
  console.log('\nInserting new documentation-based patterns...');
  
  const insertStmt = db.prepare(`
    INSERT INTO patterns (
      id, type, title, summary, trust_score,
      json_canonical, pattern_digest, 
      schema_version, pattern_version,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTransaction = db.transaction((patterns) => {
    for (const pattern of patterns) {
      const digest = calculatePatternDigest(pattern);
      
      insertStmt.run(
        pattern.id,
        pattern.type,
        pattern.title,
        pattern.summary,
        pattern.trust_score,
        JSON.stringify(pattern),
        digest,
        pattern.schema_version,
        pattern.pattern_version,
        pattern.created_at,
        pattern.updated_at
      );
      
      console.log(`✅ Created ${pattern.id}: ${pattern.title}`);
    }
  });

  insertTransaction(newDocPatterns);
}

// Run the script
try {
  console.log('Adding new patterns from official documentation...\n');
  
  insertNewPatterns();
  
  // Verify counts
  const patternCount = db.prepare('SELECT COUNT(*) as count FROM patterns').get();
  console.log(`\nTotal patterns in database: ${patternCount.count}`);
  
  console.log('\n✅ New patterns added successfully!');
} catch (error) {
  console.error('❌ Error adding patterns:', error);
  process.exit(1);
} finally {
  db.close();
}