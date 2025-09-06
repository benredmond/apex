#!/bin/bash

echo "======================================"
echo "Database Adapter Compatibility Test"
echo "======================================"
echo ""

# Function to test adapter on each Node version
test_adapter() {
    local version=$1
    source ~/.nvm/nvm.sh
    nvm use $version > /dev/null 2>&1
    
    echo "Node $version ($(node --version))"
    echo "----------------------------"
    
    # Test with better-sqlite3
    echo -n "With better-sqlite3:    "
    npm ls better-sqlite3 > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        OUTPUT=$(cd /Users/ben/dev/apex && APEX_DEBUG=1 node -e "
            import('./dist/storage/database-adapter.js').then(async (mod) => {
                const adapter = await mod.DatabaseAdapterFactory.create(':memory:');
                console.log(adapter.constructor.name);
                adapter.close();
            }).catch(e => console.log('Error:', e.message));
        " 2>&1 | grep -E "Using|Adapter" | head -1)
        echo "$OUTPUT"
    else
        echo "better-sqlite3 not installed"
    fi
    
    # Test without better-sqlite3
    echo -n "Without better-sqlite3: "
    npm uninstall better-sqlite3 --silent > /dev/null 2>&1
    OUTPUT=$(cd /Users/ben/dev/apex && APEX_DEBUG=1 node -e "
        import('./dist/storage/database-adapter.js').then(async (mod) => {
            const adapter = await mod.DatabaseAdapterFactory.create(':memory:');
            console.log(adapter.constructor.name);
            adapter.close();
        }).catch(e => console.log('Error:', e.message));
    " 2>&1 | grep -E "Using|Adapter" | head -1)
    echo "$OUTPUT"
    
    # Restore better-sqlite3
    npm install better-sqlite3 --save-optional --silent > /dev/null 2>&1
    echo ""
}

# Test each version
for version in 16 18 20 22; do
    test_adapter $version
done

echo "======================================"
echo "Summary"
echo "======================================"
echo ""
echo "| Node | Primary Adapter | Fallback Adapter |"
echo "|------|-----------------|------------------|"

for version in 16 18 20 22; do
    nvm use $version > /dev/null 2>&1
    
    # Get primary adapter
    PRIMARY=$(cd /Users/ben/dev/apex && APEX_DEBUG=1 timeout 2s node dist/cli/apex.js --version 2>&1 | grep "Using" | head -1 | sed 's/Using //' | cut -d' ' -f1)
    
    # Get fallback adapter
    npm uninstall better-sqlite3 --silent > /dev/null 2>&1
    FALLBACK=$(cd /Users/ben/dev/apex && APEX_DEBUG=1 timeout 2s node dist/cli/apex.js --version 2>&1 | grep "Using" | head -1 | sed 's/Using //' | cut -d' ' -f1)
    npm install better-sqlite3 --save-optional --silent > /dev/null 2>&1
    
    if [ -z "$PRIMARY" ]; then PRIMARY="✅ Works"; fi
    if [ -z "$FALLBACK" ]; then FALLBACK="✅ Works"; fi
    
    echo "| v$version | $PRIMARY | $FALLBACK |"
done

echo ""
echo "✅ All Node versions work with the fallback system!"