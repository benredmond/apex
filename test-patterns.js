import { PatternRepository } from "./dist/storage/repository.js";

const repo = new PatternRepository({ dbPath: "patterns.db" });

async function test() {
  const result = await repo.search({
    task: "fix validation errors",
    k: 10
  });

  console.log("Found", result.patterns.length, "patterns");
  if (result.patterns.length > 0) {
    console.log("First:", result.patterns[0].title);
  }
  repo.shutdown();
}

test();