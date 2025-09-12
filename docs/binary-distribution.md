# APEX Distribution System (Simplified)

## Overview

As of v0.4.5, APEX has been simplified to use JavaScript execution only, removing the complex binary distribution system for better reliability and maintainability.

## How NPX Works with APEX

When a user runs `npx @benredmond/apex`, here's what happens:

1. **NPX Package Resolution**: NPX downloads the package from npm registry (or uses local cache)
2. **Direct Execution**: NPX directly executes `src/cli/apex.js` (defined in package.json `bin` field)
3. **Database Adapter Selection**: The system automatically selects the best SQLite adapter:
   - Node.js 22+: Uses built-in `node:sqlite`
   - Node.js 16-20: Uses `sql.js` (WebAssembly fallback)

## Simplified Architecture

```
npx @benredmond/apex
└── src/cli/apex.js (Direct Entry Point)
    └── DatabaseAdapterFactory
        ├── node:sqlite (Node 22+)
        ├── better-sqlite3 (if available)
        └── sql.js (universal fallback)
```

## Benefits of Simplification

1. **Universal Compatibility**: Works on any Node.js 16+ without compilation
2. **Smaller Package**: Reduced from 66.8MB to 2.9MB (96% reduction)
3. **No Binary Issues**: Eliminates NODE_MODULE_VERSION mismatches
4. **Simpler Maintenance**: No need to build and distribute platform-specific binaries
5. **Faster Installation**: Smaller package downloads faster

## Performance Considerations

While JavaScript execution is slightly slower than compiled binaries at startup, the difference is negligible for APEX's use case:
- Startup time difference: ~50-100ms
- Database operations: Same performance (handled by native SQLite adapters)
- Overall user experience: Effectively identical

## Legacy Binary Support

The binary build system has been removed. If you need maximum performance, you can:
1. Clone the repository locally
2. Run APEX directly from source
3. Use Node.js 22+ for built-in SQLite performance

## Migration from Previous Versions

If you were using environment variables like `APEX_FORCE_JS` or `APEX_USE_BINARY`, these are no longer needed and can be removed.