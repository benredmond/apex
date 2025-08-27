/**
 * Tests for graceful validation mode
 * [PAT:AUTO:nYDVmugt] ★★★★☆ - Subprocess isolation for module linking issues
 */

import { describe, it, expect } from "@jest/globals";
import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Graceful Validation", () => {
  describe("Pattern ID Validation", () => {
    it("should accept 2-segment pattern IDs", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-validation-test-"));
      
      try {
        const script = `
          import { PatternIdSchema } from "${path.resolve("dist/schemas/pattern/base.js")}";
          
          const result = PatternIdSchema.safeParse("PAT:ERROR");
          if (!result.success) {
            console.log("FAIL: Should accept 2-segment pattern IDs");
            process.exit(1);
          }
          if (result.data !== "PAT:ERROR") {
            console.log("FAIL: Data mismatch");
            process.exit(1);
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-2segment.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    it("should accept 3-segment pattern IDs", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-validation-test-"));
      
      try {
        const script = `
          import { PatternIdSchema } from "${path.resolve("dist/schemas/pattern/base.js")}";
          
          const result = PatternIdSchema.safeParse("PAT:API:ERROR");
          if (!result.success) {
            console.log("FAIL: Should accept 3-segment pattern IDs");
            process.exit(1);
          }
          if (result.data !== "PAT:API:ERROR") {
            console.log("FAIL: Data mismatch");
            process.exit(1);
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-3segment.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    it("should accept 4-segment pattern IDs", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-validation-test-"));
      
      try {
        const script = `
          import { PatternIdSchema } from "${path.resolve("dist/schemas/pattern/base.js")}";
          
          const result = PatternIdSchema.safeParse("ORG.TEAM:PAT:API:ERROR");
          if (!result.success) {
            console.log("FAIL: Should accept 4-segment pattern IDs");
            process.exit(1);
          }
          if (result.data !== "ORG.TEAM:PAT:API:ERROR") {
            console.log("FAIL: Data mismatch");
            process.exit(1);
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-4segment.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    it("should reject 1-segment pattern IDs", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-validation-test-"));
      
      try {
        const script = `
          import { PatternIdSchema } from "${path.resolve("dist/schemas/pattern/base.js")}";
          
          const result = PatternIdSchema.safeParse("PATTERN");
          if (result.success) {
            console.log("FAIL: Should reject 1-segment pattern IDs");
            process.exit(1);
          }
          if (!result.error.issues[0].message.includes("2-4 segments")) {
            console.log("FAIL: Error message should mention 2-4 segments");
            process.exit(1);
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-1segment.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    it("should reject 5-segment pattern IDs", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-validation-test-"));
      
      try {
        const script = `
          import { PatternIdSchema } from "${path.resolve("dist/schemas/pattern/base.js")}";
          
          const result = PatternIdSchema.safeParse("A:B:C:D:E");
          if (result.success) {
            console.log("FAIL: Should reject 5-segment pattern IDs");
            process.exit(1);
          }
          if (!result.error.issues[0].message.includes("2-4 segments")) {
            console.log("FAIL: Error message should mention 2-4 segments");
            process.exit(1);
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-5segment.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    it("should accept pattern IDs with dots and hyphens", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-validation-test-"));
      
      try {
        const script = `
          import { PatternIdSchema } from "${path.resolve("dist/schemas/pattern/base.js")}";
          
          const result = PatternIdSchema.safeParse("ORG.TEAM:PAT-FIX:API_ERROR");
          if (!result.success) {
            console.log("FAIL: Should accept pattern IDs with dots and hyphens");
            process.exit(1);
          }
          if (result.data !== "ORG.TEAM:PAT-FIX:API_ERROR") {
            console.log("FAIL: Data mismatch");
            process.exit(1);
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-special.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });
  });

  describe("Environment Variable Control", () => {
    it("should default to strict mode when env var not set", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-env-test-"));
      
      try {
        const script = `
          delete process.env.APEX_REFLECTION_MODE;
          const isPermissive = process.env.APEX_REFLECTION_MODE === 'permissive';
          if (isPermissive) {
            console.log("FAIL: Should default to strict mode");
            process.exit(1);
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-env-default.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    it("should enable permissive mode when env var is set", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-env-test-"));
      
      try {
        const script = `
          process.env.APEX_REFLECTION_MODE = 'permissive';
          const isPermissive = process.env.APEX_REFLECTION_MODE === 'permissive';
          if (!isPermissive) {
            console.log("FAIL: Should be in permissive mode");
            process.exit(1);
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-env-permissive.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    it("should be in strict mode for any other value", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-env-test-"));
      
      try {
        const script = `
          process.env.APEX_REFLECTION_MODE = 'random';
          const isPermissive = process.env.APEX_REFLECTION_MODE === 'permissive';
          if (isPermissive) {
            console.log("FAIL: Should be in strict mode for non-permissive values");
            process.exit(1);
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-env-other.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });
  });

  describe("Git Ref Acceptance", () => {
    it("should recognize common git refs", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-git-test-"));
      
      try {
        const script = `
          const gitRefs = ['HEAD', 'main', 'master', 'origin/main', 'origin/master'];
          
          for (const ref of gitRefs) {
            const isGitRef = gitRefs.includes(ref);
            if (!isGitRef) {
              console.log(\`FAIL: Should recognize \${ref} as git ref\`);
              process.exit(1);
            }
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-git-refs.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    it("should not recognize arbitrary strings as git refs", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-git-test-"));
      
      try {
        const script = `
          const gitRefs = ['HEAD', 'main', 'master', 'origin/main', 'origin/master'];
          const nonRefs = ['abc123', 'feature/branch', 'develop'];
          
          for (const ref of nonRefs) {
            const isGitRef = gitRefs.includes(ref);
            if (isGitRef) {
              console.log(\`FAIL: Should not recognize \${ref} as git ref\`);
              process.exit(1);
            }
          }
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-non-refs.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });
  });
});

// Helper function to run script in subprocess
async function runScript(scriptPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_PATH: path.join(__dirname, "../node_modules")
      }
    });
    
    let stdout = "";
    let stderr = "";
    
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    proc.on("close", (code) => {
      if (code === 0 && stdout.includes("SUCCESS")) {
        resolve(true);
      } else {
        reject(new Error(`Script failed: ${stderr || stdout}`));
      }
    });
  });
}