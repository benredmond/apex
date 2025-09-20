import { describe, test, expect } from "vitest";
import { addNumbers } from "../test-hook.js";

describe("addNumbers", () => {
  test("should add two numbers correctly", () => {
    expect(addNumbers(2, 3)).toBe(5); // This will fail!
  });
});