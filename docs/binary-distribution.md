# APEX Binary Distribution System

## Overview

APEX supports both JavaScript execution and pre-compiled binary distribution for faster startup times and better user experience.

## How NPX Works with APEX

When a user runs `npx @benredmond/apex`, here's what happens:

1. **NPX Package Resolution**: NPX downloads the package from npm registry (or uses local cache)
2. **Entry Point Execution**: NPX executes the `bin/apex-wrapper.js` script (defined in package.json `bin` field)
3. **Binary Detection**: The wrapper script detects the current platform and architecture
4. **Binary or Fallback**:
   - If a matching pre-compiled binary exists in `binaries/`, it executes that
   - If no binary is found, it falls back to the Node.js version (`src/cli/apex.js`)

## Architecture

```
npx @benredmond/apex
├── bin/apex-wrapper.js (Entry Point)
│   ├── Platform Detection (darwin-arm64, linux-x64, etc.)
│   ├── Binary Path Resolution
│   ├── Binary Execution (if available)
│   └── JavaScript Fallback (if binary not found)
├── binaries/
│   ├── apex-darwin-x64
│   ├── apex-darwin-arm64
│   ├── apex-linux-x64
│   ├── apex-linux-arm64
│   ├── apex-win32-x64.exe
│   └── apex-win32-arm64.exe
└── src/cli/apex.js (JavaScript Implementation)
```

## Binary Creation Process

### Current Implementation

The build system uses `pkg` to create platform-specific binaries:

```bash
# Build binary for current platform
npm run build:binary

# Build binaries for all platforms
npm run build:binary:all
```

### Build Process Details

1. **TypeScript Compilation**: `tsc` compiles TypeScript to `dist/`
2. **Binary Packaging**: `pkg` bundles the application with Node.js runtime
3. **Asset Bundling**: Native dependencies (like `better-sqlite3`) are included
4. **Platform Targeting**: Creates separate binaries for each platform/architecture

### Challenges & Solutions

**Native Dependencies**:
- `better-sqlite3` requires platform-specific compilation
- Solution: pkg's asset bundling includes native binaries

**ES Modules**:
- pkg has limited ES module support
- Solution: CommonJS wrapper (`bin/apex-cjs.cjs`) spawns the ES module CLI

**File Path Resolution**:
- Bundled applications have different file system layout
- Solution: Environment flag (`APEX_BINARY_MODE`) for binary-specific paths

## Benefits

1. **Faster Startup**: ~10-50ms vs 200-500ms for Node.js
2. **No Dependencies**: Binaries include Node.js runtime
3. **Better UX**: Works without Node.js installation (for native binaries)
4. **Fallback Safety**: JavaScript version always available

## Distribution Strategy

### Package Structure

```json
{
  "bin": {
    "apex": "./bin/apex-wrapper.js"
  },
  "files": [
    "src/",
    "bin/",
    "binaries/",
    "templates/"
  ]
}
```

### Optional Dependencies (Future)

For even better distribution, we could split into platform-specific packages:

```json
{
  "optionalDependencies": {
    "@benredmond/apex-darwin-x64": "0.4.1",
    "@benredmond/apex-linux-x64": "0.4.1",
    "@benredmond/apex-win32-x64": "0.4.1"
  }
}
```

## Testing

```bash
# Test wrapper logic
npx . --version

# Test with binary present
# Should show: "🚀 APEX Binary Version 1.0.0 (darwin-arm64)"

# Test with binary removed
mv binaries/apex-darwin-arm64 binaries/apex-darwin-arm64.bak
npx . --version
# Should show: "1.0.0" (JavaScript fallback)
```

## Production Deployment

1. **Build Phase**: CI/CD builds binaries for all platforms
2. **Package Phase**: All binaries included in npm package
3. **Distribution**: Single package works across all platforms
4. **Runtime**: Wrapper selects appropriate binary automatically

This approach provides the performance benefits of compiled binaries while maintaining the convenience and reliability of JavaScript fallback.