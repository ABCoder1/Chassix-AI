import { afterEach, describe, expect, it } from "vitest";
import { createAgentMemoryStore, NullMemoryStore } from "./moss-memory.js";

const ID = process.env.MOSS_PROJECT_ID;
const KEY = process.env.MOSS_PROJECT_KEY;

afterEach(() => {
  if (ID === undefined) delete process.env.MOSS_PROJECT_ID;
  else process.env.MOSS_PROJECT_ID = ID;
  if (KEY === undefined) delete process.env.MOSS_PROJECT_KEY;
  else process.env.MOSS_PROJECT_KEY = KEY;
});

describe("createAgentMemoryStore", () => {
  it("returns a no-op store (keyless) when MOSS credentials are absent", async () => {
    delete process.env.MOSS_PROJECT_ID;
    delete process.env.MOSS_PROJECT_KEY;
    const store = createAgentMemoryStore();
    expect(store).toBeInstanceOf(NullMemoryStore);
    expect(store.live).toBe(false);
    // No-op store never throws and recalls nothing.
    await expect(store.remember({ id: "x", text: "y" })).resolves.toBeUndefined();
    await expect(store.recall("anything")).resolves.toEqual([]);
  });

  it("returns a live Moss-backed store when both credentials are set", () => {
    process.env.MOSS_PROJECT_ID = "proj";
    process.env.MOSS_PROJECT_KEY = "key";
    const store = createAgentMemoryStore();
    expect(store.live).toBe(true);
    expect(store).not.toBeInstanceOf(NullMemoryStore);
  });
});
