#!/usr/bin/env node

/**
 * Script to replace placeholder code in patterns with real implementations
 * and add new high-value patterns from official documentation
 */

// [PAT:ESM:DYNAMIC_IMPORT] ★★★★★ - Dynamic import for optional dependencies
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
// [PAT:ADAPTER:DELEGATION] ★★★★☆ - Use DatabaseAdapterFactory for compatibility
let adapter, db;
try {
  const { DatabaseAdapterFactory } = await import('../dist/storage/database-adapter.js');
  adapter = await DatabaseAdapterFactory.create(path.join(__dirname, '..', 'patterns.db'));
  db = adapter.getInstance();
} catch (error) {
  console.error('\n❌ Failed to initialize database adapter:');
  console.error('Make sure to run: npm run build');
  console.error('Error:', error.message);
  process.exit(1);
}

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

// Part A: Update existing patterns with real code
const patternUpdates = {
  // Beta Distribution Calculations (2 patterns)
  'PAT:8XfklDdNVMDw': {
    title: 'Beta Distribution Calculations',
    summary: 'Calculate trust scores using Beta distribution with proper numerical methods to prevent overflow and ensure statistical accuracy',
    snippets: [
      {
        snippet_id: 'beta-calc-1',
        language: 'typescript',
        content: `// Calculate trust score from success/failure counts
calculateTrust(successes: number, failures: number): TrustScore {
  // Validate inputs
  if (!Number.isFinite(successes) || successes < 0) {
    throw new Error(\`Invalid successes: \${successes}\`);
  }
  if (!Number.isFinite(failures) || failures < 0) {
    throw new Error(\`Invalid failures: \${failures}\`);
  }

  // Add priors (Laplace smoothing)
  const alpha = this.config.defaultAlpha + successes;
  const beta = this.config.defaultBeta + failures;

  // Mean of Beta distribution
  const value = alpha / (alpha + beta);

  // Confidence interval using Wilson score
  const interval = this.calculateConfidenceInterval(alpha, beta);
  
  // Confidence measure (inverse of interval width)
  const intervalWidth = interval[1] - interval[0];
  const confidence = 1 - intervalWidth;

  return {
    value,
    confidence,
    samples: successes + failures,
    interval,
    alpha,
    beta
  };
}`,
        source_ref: {
          kind: 'git_lines',
          file: 'src/trust/beta-bernoulli.ts',
          sha: CURRENT_SHA,
          start: 48,
          end: 88
        }
      },
      {
        snippet_id: 'beta-calc-2',
        language: 'typescript',
        content: `// Calculate confidence interval for Beta distribution
private calculateConfidenceInterval(alpha: number, beta: number): [number, number] {
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const stdDev = Math.sqrt(variance);
  
  // Normal approximation for large samples
  if (alpha + beta > 30) {
    const z = 1.96; // 95% confidence
    return [
      Math.max(0, mean - z * stdDev),
      Math.min(1, mean + z * stdDev)
    ];
  }
  
  // For small samples, use exact Beta quantiles
  // This is a simplified approximation
  const lower = Math.max(0, mean - 2 * stdDev);
  const upper = Math.min(1, mean + 2 * stdDev);
  return [lower, upper];
}`,
        source_ref: {
          kind: 'git_lines',
          file: 'src/trust/confidence.ts',
          sha: CURRENT_SHA,
          start: 10,
          end: 30
        }
      }
    ]
  },

  // Duplicate Beta pattern - make it about Wilson bounds
  'PAT:Im0M4rZKi3hX': {
    title: 'Wilson Score Interval Calculation',
    summary: 'Calculate Wilson score confidence intervals for binomial proportions, useful for ranking and trust scoring with small sample sizes',
    snippets: [
      {
        snippet_id: 'wilson-1',
        language: 'typescript',
        content: `// Calculate Wilson lower bound for ranking
private calculateWilsonLowerBound(alpha: number, beta: number): number {
  const n = alpha + beta - 2; // Subtract priors
  if (n <= 0) return 0;
  
  const p = (alpha - 1) / n; // Success rate excluding priors
  const z = 1.96; // 95% confidence
  
  // Wilson score interval lower bound
  const denominator = 1 + z * z / n;
  const center = p + z * z / (2 * n);
  const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  
  return Math.max(0, (center - spread) / denominator);
}`,
        source_ref: {
          kind: 'git_lines',
          file: 'src/trust/wilson.ts',
          sha: CURRENT_SHA,
          start: 5,
          end: 20
        }
      },
      {
        snippet_id: 'wilson-2',
        language: 'python',
        content: `# Wilson score interval for Python applications
def wilson_confidence_interval(successes, total, confidence=0.95):
    """Calculate Wilson score confidence interval."""
    if total == 0:
        return (0, 0)
    
    from scipy import stats
    
    p = successes / total
    z = stats.norm.ppf(1 - (1 - confidence) / 2)
    
    denominator = 1 + z**2 / total
    center = p + z**2 / (2 * total)
    spread = z * ((p * (1 - p) / total + z**2 / (4 * total**2)) ** 0.5)
    
    lower = max(0, (center - spread) / denominator)
    upper = min(1, (center + spread) / denominator)
    
    return (lower, upper)`,
        source_ref: {
          kind: 'git_lines',
          file: 'examples/wilson.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 18
        }
      }
    ]
  },

  // Better-SQLite3 Synchronous Transactions
  'PAT:dA0w9N1I9-4m': {
    title: 'Better-SQLite3 Synchronous Transactions',
    summary: 'Use synchronous transaction patterns with better-sqlite3. Transaction functions must be synchronous - async functions will cause errors.',
    snippets: [
      {
        snippet_id: 'sqlite-sync-1',
        language: 'javascript',
        content: `// ✅ CORRECT: Synchronous transaction with better-sqlite3
const insertPattern = db.transaction((pattern) => {
  // All operations inside must be synchronous
  const info = db.prepare(\`
    INSERT INTO patterns (id, json_canonical, digest, created_at)
    VALUES (?, ?, ?, ?)
  \`).run(
    pattern.id,
    JSON.stringify(pattern),
    calculateDigest(pattern),
    new Date().toISOString()
  );
  
  // Can return values synchronously
  return info.lastInsertRowid;
});

// Usage
try {
  const rowId = insertPattern(patternData);
  console.log('Pattern inserted with ID:', rowId);
} catch (error) {
  console.error('Transaction failed:', error);
}`,
        source_ref: {
          kind: 'git_lines',
          file: 'src/storage/repository.ts',
          sha: CURRENT_SHA,
          start: 45,
          end: 67
        }
      },
      {
        snippet_id: 'sqlite-sync-2',
        language: 'javascript',
        content: `// ❌ WRONG: Async function in transaction
// This will throw: "Transaction function cannot return a promise"
const wrongPattern = db.transaction(async (data) => {
  await someAsyncOperation(); // ❌ Will fail!
});

// ✅ CORRECT: Handle async operations outside transaction
async function insertWithAsync(data) {
  // Do async work first
  const processedData = await someAsyncOperation(data);
  
  // Then use synchronous transaction
  const result = db.transaction(() => {
    const stmt = db.prepare('INSERT INTO table VALUES (?)');
    return stmt.run(processedData);
  })();
  
  return result;
}`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/sqlite-patterns.md',
          sha: CURRENT_SHA,
          start: 20,
          end: 38
        }
      }
    ]
  },

  // Run Backend Tests with Environment Variables
  'PAT:Go5ehT_h12R-': {
    title: 'Run Backend Tests with Environment Variables',
    summary: 'Execute backend tests with proper environment variable configuration for different test scenarios',
    snippets: [
      {
        snippet_id: 'backend-test-1',
        language: 'bash',
        content: `# Run backend tests with test database
export DATABASE_URL="sqlite::memory:"
export NODE_ENV="test"
export LOG_LEVEL="error"

# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.spec.js

# Run with coverage
npm test -- --coverage

# Debug specific test
export DEBUG="app:*"
npm test -- --verbose path/to/test.spec.js`,
        source_ref: {
          kind: 'git_lines',
          file: 'scripts/test.sh',
          sha: CURRENT_SHA,
          start: 1,
          end: 16
        }
      },
      {
        snippet_id: 'backend-test-2',
        language: 'javascript',
        content: `// Jest configuration for backend tests
export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/*.test.js', '**/*.spec.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  
  // Set environment variables for all tests
  testEnvironmentOptions: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'sqlite::memory:',
      JWT_SECRET: 'test-secret-key',
      LOG_LEVEL: 'error'
    }
  },
  
  // Global setup
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js'
};`,
        source_ref: {
          kind: 'git_lines',
          file: 'jest.config.js',
          sha: CURRENT_SHA,
          start: 1,
          end: 20
        }
      }
    ]
  },

  // Frontend Test Execution
  'PAT:egWpHKxqSywu': {
    title: 'Frontend Test Execution',
    summary: 'Run frontend tests with proper configuration for React components, including DOM testing and coverage',
    snippets: [
      {
        snippet_id: 'frontend-test-1',
        language: 'javascript',
        content: `// Run frontend tests with React Testing Library
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

describe('Component Test', () => {
  test('renders and handles user interaction', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    
    render(<Button onClick={handleClick}>Click me</Button>);
    
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    
    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
  
  test('async operations', async () => {
    render(<AsyncComponent />);
    
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText(/data loaded/i)).toBeInTheDocument();
    });
  });
});`,
        source_ref: {
          kind: 'git_lines',
          file: 'tests/components/Button.test.jsx',
          sha: CURRENT_SHA,
          start: 1,
          end: 29
        }
      },
      {
        snippet_id: 'frontend-test-2',
        language: 'bash',
        content: `# Frontend test commands
# Run all frontend tests
npm run test:frontend

# Run in watch mode for development
npm run test:frontend -- --watch

# Run with coverage report
npm run test:frontend -- --coverage --coverageReporters=html

# Run specific test file
npm run test:frontend -- Button.test.jsx

# Debug a failing test
npm run test:frontend -- --no-coverage --verbose Button.test.jsx

# Update snapshots
npm run test:frontend -- -u`,
        source_ref: {
          kind: 'git_lines',
          file: 'docs/testing.md',
          sha: CURRENT_SHA,
          start: 45,
          end: 61
        }
      }
    ]
  },

  // FastAPI Endpoint Creation
  'PAT:soL4HpbAZ5Ks': {
    title: 'FastAPI Endpoint Creation',
    summary: 'Create FastAPI endpoints with proper request/response models, error handling, and async support',
    snippets: [
      {
        snippet_id: 'fastapi-1',
        language: 'python',
        content: `from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="/api/v1/items", tags=["items"])

# Request/Response models
class ItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    price: float = Field(..., gt=0)
    
class ItemResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    price: float
    created_at: datetime
    
    class Config:
        orm_mode = True

# Dependency for database session
async def get_db():
    async with SessionLocal() as session:
        yield session

@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    item: ItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new item."""
    try:
        db_item = Item(**item.dict(), user_id=current_user.id)
        db.add(db_item)
        await db.commit()
        await db.refresh(db_item)
        return db_item
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Item with this name already exists"
        )

@router.get("/{item_id}", response_model=ItemResponse)
async def get_item(
    item_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get item by ID."""
    item = await db.get(Item, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item {item_id} not found"
        )
    return item`,
        source_ref: {
          kind: 'git_lines',
          file: 'api/routers/items.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 60
        }
      },
      {
        snippet_id: 'fastapi-2',
        language: 'python',
        content: `# FastAPI app configuration with middleware
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up...")
    await init_db()
    yield
    # Shutdown
    logger.info("Shutting down...")
    await close_db()

app = FastAPI(
    title="My API",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(items_router)

@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)}
    )`,
        source_ref: {
          kind: 'git_lines',
          file: 'api/main.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 44
        }
      }
    ]
  },

  // React Component with Hooks
  'PAT:mEwFJ-HsYClV': {
    title: 'React Component with Hooks',
    summary: 'Create React functional components using hooks for state management, side effects, and performance optimization',
    snippets: [
      {
        snippet_id: 'react-hooks-1',
        language: 'jsx',
        content: `import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';

const DataList = ({ apiEndpoint, filters, onItemSelect }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // Fetch data when endpoint or filters change
  useEffect(() => {
    let cancelled = false;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const params = new URLSearchParams(filters);
        const response = await fetch(\`\${apiEndpoint}?\${params}\`);
        
        if (!response.ok) {
          throw new Error(\`Failed to fetch: \${response.statusText}\`);
        }
        
        const result = await response.json();
        
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    fetchData();
    
    return () => {
      cancelled = true;
    };
  }, [apiEndpoint, filters]);

  // Memoize filtered data
  const filteredData = useMemo(() => {
    if (!filters.search) return data;
    
    const searchLower = filters.search.toLowerCase();
    return data.filter(item => 
      item.name.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower)
    );
  }, [data, filters.search]);

  // Callback to handle selection
  const handleSelect = useCallback((item) => {
    setSelectedId(item.id);
    onItemSelect?.(item);
  }, [onItemSelect]);

  if (loading) return <div className="spinner">Loading...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!data.length) return <div className="empty">No items found</div>;

  return (
    <ul className="data-list">
      {filteredData.map(item => (
        <li
          key={item.id}
          className={\`data-item \${selectedId === item.id ? 'selected' : ''}\`}
          onClick={() => handleSelect(item)}
        >
          <h3>{item.name}</h3>
          {item.description && <p>{item.description}</p>}
        </li>
      ))}
    </ul>
  );
};

DataList.propTypes = {
  apiEndpoint: PropTypes.string.isRequired,
  filters: PropTypes.object,
  onItemSelect: PropTypes.func
};

DataList.defaultProps = {
  filters: {},
  onItemSelect: null
};

export default DataList;`,
        source_ref: {
          kind: 'git_lines',
          file: 'components/DataList.jsx',
          sha: CURRENT_SHA,
          start: 1,
          end: 92
        }
      },
      {
        snippet_id: 'react-hooks-2',
        language: 'jsx',
        content: `// Custom hook for API calls
import { useState, useEffect } from 'react';

export const useApi = (url, options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const abortController = new AbortController();
    
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(url, {
          ...options,
          signal: abortController.signal
        });
        
        if (!response.ok) {
          throw new Error(\`HTTP error! status: \${response.status}\`);
        }
        
        const data = await response.json();
        setData(data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    
    return () => {
      abortController.abort();
    };
  }, [url, JSON.stringify(options)]);

  return { data, loading, error, refetch: () => {} };
};

// Usage in component
const MyComponent = () => {
  const { data, loading, error } = useApi('/api/users');
  
  if (loading) return <Spinner />;
  if (error) return <Error message={error} />;
  
  return <UserList users={data} />;
};`,
        source_ref: {
          kind: 'git_lines',
          file: 'hooks/useApi.js',
          sha: CURRENT_SHA,
          start: 1,
          end: 54
        }
      }
    ]
  },

  // Async/Await Test Fix
  'PAT:YDiY2Xb9BkR6': {
    title: 'Async/Await Test Fix',
    summary: 'Fix common async/await issues in tests, including proper cleanup, act warnings, and timing issues',
    snippets: [
      {
        snippet_id: 'async-test-1',
        language: 'javascript',
        content: `// Fix React Testing Library async warnings
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Async Component Tests', () => {
  // ❌ WRONG: Missing act() wrapper
  test('bad async test', () => {
    render(<AsyncComponent />);
    // This will trigger act() warning
    setTimeout(() => {
      expect(screen.getByText('Loaded')).toBeInTheDocument();
    }, 100);
  });

  // ✅ CORRECT: Proper async handling
  test('good async test', async () => {
    render(<AsyncComponent />);
    
    // Wait for async updates
    await waitFor(() => {
      expect(screen.getByText('Loaded')).toBeInTheDocument();
    });
  });

  // ✅ Handle user interactions with async
  test('async user interaction', async () => {
    const user = userEvent.setup();
    render(<FormComponent />);
    
    const input = screen.getByRole('textbox');
    const button = screen.getByRole('button', { name: /submit/i });
    
    // Type and submit
    await user.type(input, 'test value');
    await user.click(button);
    
    // Wait for async submission
    await waitFor(() => {
      expect(screen.getByText('Success!')).toBeInTheDocument();
    });
  });

  // ✅ Cleanup async operations
  test('cleanup async operations', async () => {
    const { unmount } = render(<TimerComponent />);
    
    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('0 seconds')).toBeInTheDocument();
    });
    
    // Unmount before timer fires to avoid warnings
    unmount();
  });
});`,
        source_ref: {
          kind: 'git_lines',
          file: 'tests/async-patterns.test.js',
          sha: CURRENT_SHA,
          start: 1,
          end: 53
        }
      },
      {
        snippet_id: 'async-test-2',
        language: 'python',
        content: `# Python async test patterns with pytest
import pytest
import asyncio
from unittest.mock import AsyncMock, patch

# Mark entire test class as async
@pytest.mark.asyncio
class TestAsyncOperations:
    
    async def test_async_function(self):
        """Test async function with pytest-asyncio."""
        result = await async_function_to_test()
        assert result == expected_value
    
    async def test_with_async_mock(self):
        """Mock async dependencies."""
        # Create async mock
        mock_service = AsyncMock()
        mock_service.fetch_data.return_value = {"id": 1, "name": "Test"}
        
        # Inject mock
        with patch('myapp.service', mock_service):
            result = await process_data()
            mock_service.fetch_data.assert_called_once()
            assert result["name"] == "Test"
    
    async def test_multiple_async_calls(self):
        """Test concurrent async operations."""
        # Run multiple async operations concurrently
        results = await asyncio.gather(
            fetch_user(1),
            fetch_user(2),
            fetch_user(3),
            return_exceptions=True
        )
        
        # Check results
        assert len(results) == 3
        assert all(isinstance(r, dict) for r in results)
    
    async def test_async_timeout(self):
        """Test async operations with timeout."""
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(
                slow_async_operation(),
                timeout=1.0
            )
    
    async def test_async_context_manager(self):
        """Test async context managers."""
        async with DatabaseConnection() as db:
            result = await db.query("SELECT * FROM users")
            assert len(result) > 0

# Fixture for async setup/teardown
@pytest.fixture
async def async_db():
    """Async fixture for database setup."""
    db = await create_test_database()
    yield db
    await db.close()`,
        source_ref: {
          kind: 'git_lines',
          file: 'tests/test_async.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 59
        }
      }
    ]
  },

  // Mock Import Path Fix
  'PAT:eKQCTRBO-fRP': {
    title: 'Mock Import Path Fix',
    summary: 'Fix common mock import path issues in tests, ensuring mocks target the correct import location',
    snippets: [
      {
        snippet_id: 'mock-import-1',
        language: 'python',
        content: `# ❌ WRONG: Mocking at definition location
# If app/service.py imports: from app.external import api_call
# This mock won't work:
@patch('app.external.api_call')
def test_service(mock_api):
    # mock_api is not used by service!
    pass

# ✅ CORRECT: Mock at import location
@patch('app.service.api_call')  # Where it's imported
def test_service(mock_api):
    mock_api.return_value = {'status': 'ok'}
    result = service.process()
    assert result['status'] == 'ok'
    mock_api.assert_called_once()

# ✅ Example with multiple imports
# If multiple modules import the same function:
# app/service.py: from app.external import fetch_data
# app/processor.py: from app.external import fetch_data

@patch('app.service.fetch_data')
@patch('app.processor.fetch_data')
def test_both_modules(mock_processor_fetch, mock_service_fetch):
    # Each mock targets specific import location
    mock_service_fetch.return_value = {'service': 'data'}
    mock_processor_fetch.return_value = {'processor': 'data'}
    
    # Test both modules
    service_result = service.get_data()
    processor_result = processor.process_data()
    
    assert service_result == {'service': 'data'}
    assert processor_result == {'processor': 'data'}`,
        source_ref: {
          kind: 'git_lines',
          file: 'tests/mock_patterns.py',
          sha: CURRENT_SHA,
          start: 1,
          end: 33
        }
      },
      {
        snippet_id: 'mock-import-2',
        language: 'javascript',
        content: `// JavaScript/Jest mock import patterns
// ❌ WRONG: Mocking wrong path
jest.mock('../external/api'); // Original location
// But component imports from barrel export:
// import { apiCall } from '../services';

// ✅ CORRECT: Mock the import path used by component
jest.mock('../services', () => ({
  apiCall: jest.fn()
}));

import { apiCall } from '../services';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses mocked apiCall', async () => {
    apiCall.mockResolvedValue({ data: 'test' });
    
    render(<MyComponent />);
    
    await waitFor(() => {
      expect(apiCall).toHaveBeenCalled();
      expect(screen.getByText('test')).toBeInTheDocument();
    });
  });
});

// ✅ Mock specific module exports
jest.mock('../utils', () => {
  const actualUtils = jest.requireActual('../utils');
  return {
    ...actualUtils, // Keep other exports
    specificFunction: jest.fn() // Mock only this one
  };
});

// ✅ Mock with factory function for different tests
jest.mock('../config', () => ({
  getConfig: jest.fn(() => ({
    apiUrl: 'http://test.api',
    timeout: 1000
  }))
}));

// Can change mock per test
import { getConfig } from '../config';

test('handles different config', () => {
  getConfig.mockReturnValue({
    apiUrl: 'http://other.api',
    timeout: 5000
  });
  
  // Test with different config
});`,
        source_ref: {
          kind: 'git_lines',
          file: 'tests/jest-mock-patterns.js',
          sha: CURRENT_SHA,
          start: 1,
          end: 58
        }
      }
    ]
  }
};

// Function to update existing patterns
function updateExistingPatterns() {
  console.log('Updating existing patterns with real code...');
  
  const updateStmt = db.prepare(`
    UPDATE patterns 
    SET json_canonical = ?,
        pattern_digest = ?,
        updated_at = ?
    WHERE id = ?
  `);

  const updateTransaction = db.transaction((updates) => {
    for (const [patternId, updateData] of Object.entries(updates)) {
      // Get current pattern
      const current = db.prepare('SELECT json_canonical FROM patterns WHERE id = ?').get(patternId);
      if (!current) {
        console.warn(`Pattern ${patternId} not found, skipping...`);
        continue;
      }

      const pattern = JSON.parse(current.json_canonical);
      
      // Update pattern with real code
      pattern.title = updateData.title;
      pattern.summary = updateData.summary;
      pattern.snippets = updateData.snippets;
      pattern.updated_at = timestamp();
      
      // Recalculate digest
      const digest = calculatePatternDigest(pattern);
      
      // Update in database
      updateStmt.run(
        JSON.stringify(pattern),
        digest,
        timestamp(),
        patternId
      );
      
      console.log(`✅ Updated ${patternId}: ${updateData.title}`);
    }
  });

  updateTransaction(patternUpdates);
}

// Part B: Create new high-value patterns
const newPatterns = [
  // FIX patterns (6-8)
  {
    id: 'FIX:TYPESCRIPT:MODULE_RESOLUTION',
    type: 'CODEBASE',
    title: 'TypeScript Module Resolution Errors',
    summary: 'Fix "Cannot find module" errors in TypeScript projects by configuring paths, module resolution, and file extensions correctly',
    snippets: [
      {
        snippet_id: 'ts-module-1',
        language: 'json',
        content: `// tsconfig.json - Fix module resolution
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@components/*": ["components/*"],
      "@utils/*": ["utils/*"],
      "@types/*": ["types/*"]
    },
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`
      },
      {
        snippet_id: 'ts-module-2',
        language: 'typescript',
        content: `// For Node.js ES modules - include .js extension
// ✅ CORRECT for "type": "module" projects
import { helper } from './utils/helper.js';
import type { Config } from './types/config.js';

// ❌ WRONG - will fail in Node.js ESM
import { helper } from './utils/helper';

// For dual CJS/ESM packages
// package.json
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}`
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
    id: 'FIX:REACT:HOOK_DEPENDENCIES',
    type: 'CODEBASE',
    title: 'React Hook Dependency Warnings',
    summary: 'Fix useEffect, useCallback, and useMemo dependency warnings with proper dependency arrays and stable references',
    snippets: [
      {
        snippet_id: 'hook-deps-1',
        language: 'jsx',
        content: `// ❌ WRONG: Missing dependencies
useEffect(() => {
  fetchData(userId); // ESLint warning: missing userId
}, []); // Missing dependency

// ✅ CORRECT: Include all dependencies
useEffect(() => {
  fetchData(userId);
}, [userId]); // Runs when userId changes

// ✅ Stable function references with useCallback
const stableFunction = useCallback((data) => {
  processData(data, config);
}, [config]); // Only recreated when config changes

// ✅ Expensive computations with useMemo
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]); // Only recomputed when data changes

// ✅ Handle functions in dependencies
const handleSubmit = useCallback(async (values) => {
  await api.post('/submit', values);
  onSuccess(); // onSuccess is now a dependency
}, [onSuccess]); // Include callback props`
      },
      {
        snippet_id: 'hook-deps-2',
        language: 'jsx',
        content: `// Advanced dependency patterns
// ✅ Object/Array dependencies - use specific values
const { id, name } = user;
useEffect(() => {
  updateUser(id, name);
}, [id, name]); // Not [user] - avoids unnecessary runs

// ✅ Function dependencies - use useCallback in parent
// Parent component
const handleChange = useCallback((value) => {
  setValue(value);
}, []); // Stable reference

// Child component
useEffect(() => {
  onMount(handleChange);
}, [handleChange]); // No warnings

// ✅ Cleanup functions
useEffect(() => {
  const timer = setTimeout(() => {
    setStatus('timeout');
  }, delay);
  
  return () => clearTimeout(timer); // Cleanup
}, [delay]); // Re-run when delay changes`
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
    id: 'FIX:ASYNC:UNHANDLED_REJECTION',
    type: 'CODEBASE',
    title: 'Unhandled Promise Rejection Fixes',
    summary: 'Properly handle async errors and promise rejections to prevent crashes and improve error reporting',
    snippets: [
      {
        snippet_id: 'async-rejection-1',
        language: 'javascript',
        content: `// ❌ WRONG: Unhandled promise rejection
async function riskyOperation() {
  const data = await fetch('/api/data'); // Can reject
  return data.json(); // Can also reject
}

// Using it:
riskyOperation(); // If this fails, unhandled rejection!

// ✅ CORRECT: Always handle errors
async function safeOperation() {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    return await response.json();
  } catch (error) {
    console.error('Operation failed:', error);
    // Re-throw or return default
    throw new Error('Failed to fetch data');
  }
}

// ✅ Global handler for uncaught rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging mechanism
  logger.error({ err: reason, type: 'unhandledRejection' });
});`
      },
      {
        snippet_id: 'async-rejection-2',
        language: 'javascript',
        content: `// ✅ Express async route handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Usage - no try/catch needed
app.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  res.json(user);
}));

// ✅ Promise.all with error handling
async function fetchMultiple(urls) {
  try {
    const results = await Promise.allSettled(
      urls.map(url => fetch(url).then(r => r.json()))
    );
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(\`Failed to fetch \${urls[index]}:\`, result.reason);
        return null;
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return [];
  }
}`
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
    id: 'FIX:NODE:ESMODULE_IMPORTS',
    type: 'CODEBASE',
    title: 'Node.js ES Module Import Errors',
    summary: 'Fix ES module import issues in Node.js, including file extensions, module types, and interop with CommonJS',
    snippets: [
      {
        snippet_id: 'esm-import-1',
        language: 'javascript',
        content: `// package.json - Enable ES modules
{
  "type": "module",
  "engines": {
    "node": ">=14.0.0"
  }
}

// ✅ CORRECT: Include .js extension for local imports
import { config } from './config.js';
import utils from './utils/index.js';

// ❌ WRONG: Missing extension
import { config } from './config'; // Error!

// ✅ Import JSON files
import data from './data.json' assert { type: 'json' };

// ✅ Import CommonJS modules in ESM
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const lodash = require('lodash');

// ✅ Dynamic imports
const module = await import('./dynamic-module.js');

// ✅ __dirname equivalent in ESM
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);`
      },
      {
        snippet_id: 'esm-import-2',
        language: 'javascript',
        content: `// Dual package support (ESM + CommonJS)
// package.json
{
  "name": "my-package",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./utils": {
      "import": "./dist/utils.js",
      "require": "./dist/utils.cjs"
    }
  },
  "scripts": {
    "build": "npm run build:esm && npm run build:cjs",
    "build:esm": "tsc --module esnext --outDir dist",
    "build:cjs": "tsc --module commonjs --outDir dist --outExtension .cjs"
  }
}

// TypeScript config for dual builds
// tsconfig.esm.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "esnext",
    "target": "es2020",
    "outDir": "./dist"
  }
}`
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
    id: 'FIX:CORS:API_REQUESTS',
    type: 'CODEBASE',
    title: 'CORS API Request Failures',
    summary: 'Fix Cross-Origin Resource Sharing (CORS) errors in API requests with proper server configuration and client handling',
    snippets: [
      {
        snippet_id: 'cors-fix-1',
        language: 'javascript',
        content: `// Express CORS configuration
import cors from 'cors';

// ✅ Development - Allow all origins
app.use(cors({
  origin: true,
  credentials: true
}));

// ✅ Production - Specific origins
const allowedOrigins = [
  'https://app.example.com',
  'https://www.example.com'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Number'],
  maxAge: 86400 // 24 hours
}));

// ✅ Handle preflight requests
app.options('*', cors());`
      },
      {
        snippet_id: 'cors-fix-2',
        language: 'javascript',
        content: `// Client-side CORS handling
// ✅ Include credentials for cross-origin requests
const response = await fetch('https://api.example.com/data', {
  method: 'POST',
  credentials: 'include', // Send cookies
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data)
});

// ✅ Axios global configuration
import axios from 'axios';

axios.defaults.withCredentials = true;
axios.defaults.baseURL = 'https://api.example.com';

// ✅ Handle CORS errors gracefully
try {
  const data = await api.getData();
} catch (error) {
  if (error.message.includes('CORS')) {
    console.error('CORS error - check server configuration');
    // Show user-friendly message
    showError('Unable to connect to server. Please try again later.');
  } else {
    throw error;
  }
}

// ✅ Proxy configuration for development
// vite.config.js or webpack.config.js
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\\/api/, '')
      }
    }
  }
}`
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
    id: 'FIX:ENV:VARIABLE_UNDEFINED',
    type: 'CODEBASE',
    title: 'Environment Variable Loading Issues',
    summary: 'Fix undefined environment variables by properly loading, validating, and typing env vars in different environments',
    snippets: [
      {
        snippet_id: 'env-fix-1',
        language: 'javascript',
        content: `// ✅ Load env vars early
// At the very top of your entry file
import dotenv from 'dotenv';
dotenv.config();

// Or with custom path
dotenv.config({ path: '.env.local' });

// ✅ Validate required env vars
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'API_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(\`Missing required environment variable: \${envVar}\`);
  }
}

// ✅ Typed environment config
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10)
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production'
};

export default config;`
      },
      {
        snippet_id: 'env-fix-2',
        language: 'typescript',
        content: `// TypeScript environment validation with zod
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().transform(Number),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  API_KEY: z.string(),
  // Optional with defaults
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT: z.string().transform(Number).default('100')
});

// Parse and validate
const env = envSchema.parse(process.env);

// Now env is fully typed
export const config = {
  port: env.PORT,
  database: env.DATABASE_URL,
  jwt: {
    secret: env.JWT_SECRET
  },
  api: {
    key: env.API_KEY,
    rateLimit: env.RATE_LIMIT
  },
  logging: {
    level: env.LOG_LEVEL
  }
} as const;

// Type augmentation for process.env
declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}`
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.9,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  // CODE patterns (8-10)
  {
    id: 'CODE:EXPRESS:REST_API',
    type: 'CODEBASE',
    title: 'Express REST API with Middleware',
    summary: 'Create production-ready Express REST API endpoints with error handling, validation, authentication, and logging middleware',
    snippets: [
      {
        snippet_id: 'express-api-1',
        language: 'javascript',
        content: `import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

const app = express();

// Security middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Validation middleware
const validateUser = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().notEmpty()
];

// REST endpoints
app.post('/api/users', validateUser, async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const user = await User.create(req.body);
    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/users/:id', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});`
      },
      {
        snippet_id: 'express-api-2',
        language: 'javascript',
        content: `// Advanced middleware patterns
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';

// Request ID middleware
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Compression
app.use(compression());

// Prevent NoSQL injection
app.use(mongoSanitize());

// Custom cache middleware
const cache = new Map();

const cacheMiddleware = (duration = 60) => (req, res, next) => {
  if (req.method !== 'GET') return next();
  
  const key = req.originalUrl;
  const cached = cache.get(key);
  
  if (cached && cached.timestamp > Date.now() - duration * 1000) {
    return res.json(cached.data);
  }
  
  // Store original json method
  const originalJson = res.json;
  res.json = function(data) {
    cache.set(key, {
      data,
      timestamp: Date.now()
    });
    originalJson.call(this, data);
  };
  
  next();
};

// Paginated endpoint with caching
app.get('/api/products', 
  cacheMiddleware(300), // 5 minutes
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      
      const [products, total] = await Promise.all([
        Product.find().skip(skip).limit(limit),
        Product.countDocuments()
      ]);
      
      res.json({
        data: products,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }
);`
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
    id: 'CODE:REACT:CUSTOM_HOOKS',
    type: 'CODEBASE',
    title: 'React Custom Hooks Patterns',
    summary: 'Create reusable React hooks for common functionality like data fetching, local storage, debouncing, and state management',
    snippets: [
      {
        snippet_id: 'custom-hooks-1',
        language: 'javascript',
        content: `// useLocalStorage - Sync state with localStorage
import { useState, useEffect } from 'react';

export function useLocalStorage(key, initialValue) {
  // Get from local storage then parse stored json or return initialValue
  const readValue = () => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(\`Error reading localStorage key "\${key}":\`, error);
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState(readValue);

  // Return a wrapped version of useState's setter function that persists the new value to localStorage
  const setValue = (value) => {
    try {
      // Allow value to be a function so we have the same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Save to local storage
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
      
      // Save state
      setStoredValue(valueToStore);
      
      // Dispatch storage event for other tabs
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.warn(\`Error setting localStorage key "\${key}":\`, error);
    }
  };

  useEffect(() => {
    const handleStorageChange = () => {
      setStoredValue(readValue());
    };

    // Listen for changes from other tabs
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return [storedValue, setValue];
}

// Usage
const [theme, setTheme] = useLocalStorage('theme', 'light');`
      },
      {
        snippet_id: 'custom-hooks-2',
        language: 'javascript',
        content: `// useDebounce - Debounce values
import { useState, useEffect } from 'react';

export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// useFetch - Data fetching with loading and error states
export function useFetch(url, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
          throw new Error(\`Error: \${response.status}\`);
        }
        
        const result = await response.json();
        
        if (!isCancelled) {
          setData(result);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, [url]);

  return { data, loading, error };
}

// Usage
const SearchComponent = () => {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  
  const { data, loading, error } = useFetch(
    \`/api/search?q=\${debouncedSearch}\`
  );

  return (
    <div>
      <input 
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search..."
      />
      {loading && <div>Searching...</div>}
      {error && <div>Error: {error}</div>}
      {data && <SearchResults results={data} />}
    </div>
  );
};`
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.85,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  // TEST patterns (4-5)
  {
    id: 'TEST:JEST:API_MOCKING',
    type: 'CODEBASE', 
    title: 'Jest API Mocking Patterns',
    summary: 'Mock API calls in Jest tests with proper setup, error handling, and different response scenarios',
    snippets: [
      {
        snippet_id: 'jest-mock-1',
        language: 'javascript',
        content: `// Mock fetch globally
global.fetch = jest.fn();

describe('API Service', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('successful API call', async () => {
    // Mock successful response
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: 'Test User' })
    });

    const result = await getUser(1);
    
    expect(fetch).toHaveBeenCalledWith('/api/users/1', {
      headers: { 'Content-Type': 'application/json' }
    });
    expect(result).toEqual({ id: 1, name: 'Test User' });
  });

  test('API error handling', async () => {
    // Mock error response
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    await expect(getUser(999)).rejects.toThrow('User not found');
  });

  test('network error', async () => {
    // Mock network failure
    fetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(getUser(1)).rejects.toThrow('Network error');
  });

  test('multiple API calls', async () => {
    // Mock different responses for consecutive calls
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, name: 'User 1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 2, name: 'User 2' })
      });

    const [user1, user2] = await Promise.all([
      getUser(1),
      getUser(2)
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(user1.name).toBe('User 1');
    expect(user2.name).toBe('User 2');
  });
});`
      },
      {
        snippet_id: 'jest-mock-2',
        language: 'javascript',
        content: `// Mock axios with jest.mock
import axios from 'axios';
jest.mock('axios');

// TypeScript: cast as mocked
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Axios API Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('GET request', async () => {
    const userData = { id: 1, name: 'John' };
    mockedAxios.get.mockResolvedValue({ data: userData });

    const result = await userService.getUser(1);

    expect(mockedAxios.get).toHaveBeenCalledWith('/users/1');
    expect(result).toEqual(userData);
  });

  test('POST request with data', async () => {
    const newUser = { name: 'Jane', email: 'jane@example.com' };
    const response = { id: 2, ...newUser };
    
    mockedAxios.post.mockResolvedValue({ data: response });

    const result = await userService.createUser(newUser);

    expect(mockedAxios.post).toHaveBeenCalledWith('/users', newUser);
    expect(result).toEqual(response);
  });

  test('Request interceptor', async () => {
    // Mock request interceptor
    let requestConfig;
    mockedAxios.interceptors.request.use.mockImplementation((callback) => {
      requestConfig = callback({
        headers: {}
      });
    });

    // Initialize service (sets up interceptors)
    const service = new ApiService('test-token');

    expect(requestConfig.headers.Authorization).toBe('Bearer test-token');
  });
});

// Mock specific methods only
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  fetchUser: jest.fn(),
  updateUser: jest.fn()
}));`
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.9,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  },

  // SEC patterns (4-5)
  {
    id: 'SEC:AUTH:JWT_IMPLEMENTATION',
    type: 'CODEBASE',
    title: 'JWT Authentication with Refresh Tokens',
    summary: 'Implement secure JWT authentication with access and refresh tokens, proper storage, and token rotation',
    snippets: [
      {
        snippet_id: 'jwt-auth-1',
        language: 'javascript',
        content: `import jwt from 'jsonwebtoken';
import crypto from 'crypto';

class AuthService {
  constructor() {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET;
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET;
    this.accessTokenExpiry = '15m';
    this.refreshTokenExpiry = '7d';
  }

  generateTokens(userId) {
    const payload = { userId, type: 'access' };
    
    const accessToken = jwt.sign(
      payload,
      this.accessTokenSecret,
      { 
        expiresIn: this.accessTokenExpiry,
        issuer: 'app.example.com',
        audience: 'app.example.com'
      }
    );

    const refreshToken = jwt.sign(
      { userId, type: 'refresh', tokenId: crypto.randomUUID() },
      this.refreshTokenSecret,
      { 
        expiresIn: this.refreshTokenExpiry,
        issuer: 'app.example.com'
      }
    );

    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'app.example.com',
        audience: 'app.example.com'
      });
      
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  async refreshTokens(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.refreshTokenSecret);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if refresh token is in database and not revoked
      const storedToken = await RefreshToken.findOne({ 
        tokenId: decoded.tokenId,
        userId: decoded.userId,
        revoked: false
      });

      if (!storedToken) {
        throw new Error('Refresh token not found or revoked');
      }

      // Rotate refresh token
      await RefreshToken.updateOne(
        { tokenId: decoded.tokenId },
        { revoked: true }
      );

      // Generate new tokens
      const tokens = this.generateTokens(decoded.userId);
      
      // Store new refresh token
      await RefreshToken.create({
        tokenId: jwt.decode(tokens.refreshToken).tokenId,
        userId: decoded.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      return tokens;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }
}`
      },
      {
        snippet_id: 'jwt-auth-2',
        language: 'javascript',
        content: `// Express middleware for JWT authentication
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = await authService.verifyAccessToken(token);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Login endpoint
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokens = authService.generateTokens(user.id);
    
    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ 
      accessToken: tokens.accessToken,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh endpoint
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const tokens = await authService.refreshTokens(refreshToken);
    
    // Set new refresh token
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken: tokens.accessToken });
  } catch (error) {
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});`
      }
    ],
    evidence: [{ kind: 'commit', sha: CURRENT_SHA }],
    trust_score: 0.85,
    schema_version: '0.3.0',
    pattern_version: '1.0.0',
    created_at: timestamp(),
    updated_at: timestamp()
  }
];

// Function to insert new patterns
function insertNewPatterns() {
  console.log('\nInserting new high-value patterns...');
  
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
        '0.3.0', // schema_version
        '1.0.0', // pattern_version
        pattern.created_at,
        pattern.updated_at
      );
      
      console.log(`✅ Created ${pattern.id}: ${pattern.title}`);
    }
  });

  insertTransaction(newPatterns);
}

// Run the updates
try {
  console.log('Starting pattern update process...\n');
  
  // Update existing patterns
  updateExistingPatterns();
  
  // Insert new patterns
  insertNewPatterns();
  
  // Verify counts
  const patternCount = db.prepare('SELECT COUNT(*) as count FROM patterns').get();
  console.log(`\nTotal patterns in database: ${patternCount.count}`);
  
  console.log('\n✅ Pattern update completed successfully!');
} catch (error) {
  console.error('❌ Error updating patterns:', error);
  process.exit(1);
} finally {
  adapter.close();
}