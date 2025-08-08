import { PatternRepository } from "./dist/storage/repository.js";
import { PatternLookupService } from "./dist/mcp/tools/lookup.js";

const repo = new PatternRepository({ dbPath: "patterns.db" });
const lookup = new PatternLookupService(repo);

async function test() {
  try {
    const result = await lookup.lookup({
      task: "fix validation errors",
      max_size: 8192
    });
    
    console.log(`Found ${result.pattern_pack.candidates.length} candidates`);
    console.log(`Total considered: ${result.pattern_pack.meta.considered}`);
    console.log(`Included: ${result.pattern_pack.meta.included}`);
    
    if (result.pattern_pack.candidates.length > 0) {
      console.log(`\nTop pattern: ${result.pattern_pack.candidates[0].title}`);
      console.log(`  Score: ${result.pattern_pack.candidates[0].score}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

test();
