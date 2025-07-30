#!/usr/bin/env node

import Database from 'better-sqlite3';

const db = new Database('patterns.db');

console.log('📝 Populating pattern metadata...\n');

// Pattern metadata mapping
const patternMetadata = {
  'PAT:dA0w9N1I9-4m': { 
    languages: ['javascript', 'typescript'], 
    frameworks: ['better-sqlite3'],
    keywords: ['sqlite', 'sync', 'transaction']
  },
  'PAT:Go5ehT_h12R-': { 
    languages: ['python', 'bash'], 
    frameworks: ['pytest'],
    keywords: ['test', 'backend', 'pytest']
  },
  'PAT:egWpHKxqSywu': { 
    languages: ['javascript', 'bash'], 
    frameworks: ['npm', 'jest'],
    keywords: ['test', 'frontend', 'npm']
  },
  'PAT:soL4HpbAZ5Ks': { 
    languages: ['python'], 
    frameworks: ['fastapi'],
    keywords: ['api', 'endpoint', 'fastapi']
  },
  'PAT:mEwFJ-HsYClV': { 
    languages: ['javascript', 'jsx'], 
    frameworks: ['react'],
    keywords: ['react', 'component', 'hooks']
  },
  'PAT:YDiY2Xb9BkR6': { 
    languages: ['python'], 
    frameworks: ['pytest'],
    keywords: ['async', 'test', 'fixture', 'await']
  },
  'PAT:eKQCTRBO-fRP': { 
    languages: ['python'], 
    frameworks: ['pytest', 'unittest'],
    keywords: ['mock', 'test', 'import']
  },
  'PAT:8XfklDdNVMDw': { 
    languages: ['typescript'], 
    frameworks: [],
    keywords: ['beta', 'distribution', 'statistics']
  },
  'PAT:Im0M4rZKi3hX': { 
    languages: ['typescript'], 
    frameworks: [],
    keywords: ['beta', 'distribution', 'statistics']
  }
};

// Insert language associations
const insertLangStmt = db.prepare(`
  INSERT OR IGNORE INTO pattern_languages (pattern_id, lang)
  VALUES (?, ?)
`);

// Insert framework associations
const insertFrameworkStmt = db.prepare(`
  INSERT OR IGNORE INTO pattern_frameworks (pattern_id, framework, semver)
  VALUES (?, ?, ?)
`);

// Clear existing associations
db.exec('DELETE FROM pattern_languages');
db.exec('DELETE FROM pattern_frameworks');

let langCount = 0;
let frameworkCount = 0;

for (const [patternId, metadata] of Object.entries(patternMetadata)) {
  // Insert languages
  for (const lang of metadata.languages) {
    insertLangStmt.run(patternId, lang);
    langCount++;
  }
  
  // Insert frameworks
  for (const framework of metadata.frameworks) {
    insertFrameworkStmt.run(patternId, framework, null);
    frameworkCount++;
  }
}

console.log(`✅ Inserted ${langCount} language associations`);
console.log(`✅ Inserted ${frameworkCount} framework associations`);

// Show summary
const summary = db.prepare(`
  SELECT 
    p.id,
    p.title,
    GROUP_CONCAT(DISTINCT l.lang) as languages,
    GROUP_CONCAT(DISTINCT f.framework) as frameworks
  FROM patterns p
  LEFT JOIN pattern_languages l ON l.pattern_id = p.id
  LEFT JOIN pattern_frameworks f ON f.pattern_id = p.id
  WHERE p.invalid = 0
  GROUP BY p.id
`).all();

console.log('\n📊 Pattern metadata summary:');
summary.forEach(p => {
  console.log(`\n${p.id}: ${p.title}`);
  console.log(`  Languages: ${p.languages || 'none'}`);
  console.log(`  Frameworks: ${p.frameworks || 'none'}`);
});

db.close();
console.log('\n✨ Done!');