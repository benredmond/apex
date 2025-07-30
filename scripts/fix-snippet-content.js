#!/usr/bin/env node

import Database from 'better-sqlite3';

const db = new Database('patterns.db');

console.log('🔧 Fixing snippet content...\n');

// Update pattern_snippets with placeholder content
const updateStmt = db.prepare(`
  UPDATE pattern_snippets 
  SET content = CASE 
    WHEN language = 'python' THEN '# Python code snippet\n# TODO: Load from source file'
    WHEN language = 'bash' THEN '#!/bin/bash\n# Bash command snippet'
    WHEN language = 'typescript' THEN '// TypeScript code snippet\n// TODO: Load from source'
    WHEN language = 'javascript' THEN '// JavaScript code snippet\n// TODO: Load from source'
    WHEN language = 'jsx' THEN '// React component snippet\n// TODO: Load from source'
    ELSE '// Code snippet'
  END
  WHERE content = '' OR content IS NULL
`);

const result = updateStmt.run();
console.log(`Updated ${result.changes} snippets with placeholder content`);

// Also update json_canonical to include content
const patterns = db.prepare(`
  SELECT id, json_canonical 
  FROM patterns 
  WHERE json_canonical IS NOT NULL
`).all();

console.log(`\nUpdating ${patterns.length} pattern canonical JSON...`);

const updateJsonStmt = db.prepare(`
  UPDATE patterns 
  SET json_canonical = ? 
  WHERE id = ?
`);

let updatedCount = 0;
for (const pattern of patterns) {
  try {
    const data = JSON.parse(pattern.json_canonical);
    
    // Add placeholder content to snippets
    if (data.snippets && Array.isArray(data.snippets)) {
      data.snippets = data.snippets.map(s => ({
        ...s,
        content: s.content || getPlaceholderContent(s.language || 'unknown')
      }));
      
      updateJsonStmt.run(JSON.stringify(data, null, 2), pattern.id);
      updatedCount++;
    }
  } catch (e) {
    console.error(`Failed to update pattern ${pattern.id}:`, e.message);
  }
}

console.log(`Updated ${updatedCount} patterns with snippet content`);

function getPlaceholderContent(language) {
  const placeholders = {
    python: `# Example Python pattern
def example_function():
    """This is a placeholder for the actual pattern code"""
    pass`,
    
    bash: `#!/bin/bash
# Example bash pattern
echo "This is a placeholder for the actual pattern"`,
    
    typescript: `// Example TypeScript pattern
function exampleFunction(): void {
  // Placeholder for actual pattern code
}`,
    
    javascript: `// Example JavaScript pattern
function exampleFunction() {
  // Placeholder for actual pattern code
}`,
    
    jsx: `// Example React pattern
const ExampleComponent = () => {
  return <div>Placeholder for actual pattern</div>;
};`
  };
  
  return placeholders[language] || '// Code pattern placeholder';
}

db.close();
console.log('\n✨ Done!');