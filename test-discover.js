import { PatternRepository } from "./dist/storage/repository.js";
import { PatternDiscoverer } from "./dist/mcp/tools/discover.js";

const repo = new PatternRepository({ dbPath: "patterns.db" });
const discoverer = new PatternDiscoverer(repo);

async function test() {
  const queries = ["test", "error", "validation", "authentication", "database"];
  
  console.log("=== Testing Pattern Discovery ===\n");
  
  for (const query of queries) {
    const result = await discoverer.discover({
      query: query,
      min_score: 0,
      max_results: 3
    });
    
    console.log(`Query "${query}": Found ${result.patterns.length} patterns`);
    if (result.patterns.length > 0) {
      console.log(`  First pattern: ${result.patterns[0].pattern.title}`);
    }
  }
  
  repo.shutdown();
}

test().catch(console.error);
