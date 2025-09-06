#!/bin/bash

# Test APEX across different Node versions
# This script tests both with and without better-sqlite3

echo "======================================"
echo "APEX Node.js Compatibility Test Suite"
echo "======================================"
echo ""

# Function to test a specific Node version
test_node_version() {
    local version=$1
    echo "Testing Node.js $version"
    echo "--------------------------------"
    
    # Switch to the specified Node version
    source ~/.nvm/nvm.sh
    nvm use $version > /dev/null 2>&1
    
    # Display actual Node version
    echo "Node version: $(node --version)"
    echo "npm version: $(npm --version)"
    echo ""
    
    # Test 1: Clean install and build
    echo "Test 1: Clean install with better-sqlite3..."
    rm -rf node_modules package-lock.json
    npm install --silent > /dev/null 2>&1
    
    # Check if build succeeds
    echo "Running TypeScript build..."
    if npm run build > /dev/null 2>&1; then
        echo "✅ Build successful"
    else
        echo "❌ Build failed"
    fi
    
    # Test 2: Basic command execution
    echo "Test 2: Running apex --version..."
    if timeout 5s node src/cli/apex.js --version > /dev/null 2>&1; then
        VERSION=$(node src/cli/apex.js --version 2>&1)
        echo "✅ Version command works: $VERSION"
    else
        echo "❌ Version command failed"
    fi
    
    # Test 3: Database adapter selection
    echo "Test 3: Database adapter selection..."
    ADAPTER_OUTPUT=$(APEX_DEBUG=1 node src/cli/apex.js --version 2>&1 | grep -E "Using|Selecting" | head -3)
    if [ -n "$ADAPTER_OUTPUT" ]; then
        echo "✅ Adapter selection:"
        echo "$ADAPTER_OUTPUT" | sed 's/^/   /'
    else
        echo "❌ Could not detect adapter selection"
    fi
    
    # Test 4: Without better-sqlite3
    echo "Test 4: Testing without better-sqlite3..."
    npm uninstall better-sqlite3 --silent > /dev/null 2>&1
    
    if timeout 5s node src/cli/apex.js --version > /dev/null 2>&1; then
        ADAPTER_FALLBACK=$(APEX_DEBUG=1 node src/cli/apex.js --version 2>&1 | grep "Using" | head -1)
        echo "✅ Works without better-sqlite3"
        echo "   Fallback: $ADAPTER_FALLBACK"
    else
        echo "❌ Failed without better-sqlite3"
    fi
    
    # Restore better-sqlite3
    npm install better-sqlite3 --save-optional --silent > /dev/null 2>&1
    
    echo ""
}

# Test each Node version
echo "Starting tests..."
echo ""

# Node 16
test_node_version 16

# Node 18
test_node_version 18

# Node 20
test_node_version 20

# Node 22
test_node_version 22

# Generate summary
echo "======================================"
echo "Test Summary"
echo "======================================"
echo ""
echo "Compatibility Matrix:"
echo ""
echo "| Node Version | Build | Run | Without better-sqlite3 |"
echo "|--------------|-------|-----|------------------------|"

# Re-test quickly for summary
for version in 16 18 20 22; do
    nvm use $version > /dev/null 2>&1
    
    BUILD_STATUS="❌"
    RUN_STATUS="❌"
    FALLBACK_STATUS="❌"
    
    if npm run build > /dev/null 2>&1; then
        BUILD_STATUS="✅"
    fi
    
    if timeout 3s node src/cli/apex.js --version > /dev/null 2>&1; then
        RUN_STATUS="✅"
    fi
    
    npm uninstall better-sqlite3 --silent > /dev/null 2>&1
    if timeout 3s node src/cli/apex.js --version > /dev/null 2>&1; then
        FALLBACK_STATUS="✅"
    fi
    npm install better-sqlite3 --save-optional --silent > /dev/null 2>&1
    
    echo "| v$version      | $BUILD_STATUS    | $RUN_STATUS  | $FALLBACK_STATUS                     |"
done

echo ""
echo "Test complete!"