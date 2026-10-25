import { describe, expect, it, vi } from "vitest";
import { BitdeerReasoner, FallbackReasoner, type Reasoner } from "./reasoner.js";

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(
    async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status: ok ? status : status,
      }),
  ) as unknown as typeof fetch;
}

describe("BitdeerReasoner", () => {
  it("calls the OpenAI-compatible endpoint with the key and maps content/reasoning", async () => {
    let url = "";
    let auth = "";
    let sentModel = "";
    const fetchImpl = vi.fn(async (u: string, init?: RequestInit) => {
      url = u;
      auth = (init?.headers as Record<string, string>).authorization ?? "";
      sentModel = JSON.parse(String(init?.body)).model;
      return new Response(
        JSON.stringify({
          model: "zai-org/GLM-5.3-Flash",
          choices: [{ message: { content: "Fermentation switch.", reasoning_content: "step 1" } }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const r = new BitdeerReasoner({ apiKey: "k", model: "zai-org/GLM-5.3-Flash", fetchImpl });
    const out = await r.reason("summary");
    expect(url).toBe("https://api-inference.bitdeer.ai/v1/chat/completions");
    expect(auth).toBe("Bearer k");
    expect(sentModel).toBe("zai-org/GLM-5.3-Flash");
    expect(out.text).toBe("Fermentation switch.");
    expect(out.thinking).toBe("step 1");
    expect(out.model).toBe("zai-org/GLM-5.3-Flash");
  });

  it("splits inline <think> blocks into thinking vs text", async () => {
    const fetchImpl = fakeFetch({
      choices: [{ message: { content: "<think>reasoning here</think>Final answer." } }],
    });
    const out = await new BitdeerReasoner({ apiKey: "k", fetchImpl }).reason("s");
    expect(out.thinking).toBe("reasoning here");
    expect(out.text).toBe("Final answer.");
  });

  it("throws on a non-200 (e.g. insufficient balance)", async () => {
    const fetchImpl = fakeFetch('{"error":{"code":"insufficient_balance"}}', false, 402);
    await expect(new BitdeerReasoner({ apiKey: "k", fetchImpl }).reason("s")).rejects.toThrow(
      /402/,
    );
  });
});

describe("FallbackReasoner", () => {
  it("falls back to the secondary when the primary throws, then sticks with it", async () => {
    const primary: Reasoner = {
      reason: vi.fn(async () => Promise.reject(new Error("no balance"))),
    };
    const secondaryFn = vi.fn(async () => ({
      thinking: "",
      text: "sonnet",
      model: "claude-sonnet-5-5",
    }));
    const secondary: Reasoner = { reason: secondaryFn };
    const fb = new FallbackReasoner(primary, secondary);

    const a = await fb.reason("s1");
    const b = await fb.reason("s2");
    expect(a.text).toBe("sonnet");
    expect(b.text).toBe("sonnet");
    // Primary tried once (then circuit-broken); secondary served both.
    expect(primary.reason).toHaveBeenCalledTimes(1);
    expect(secondaryFn).toHaveBeenCalledTimes(2);
  });

  it("uses the primary when it succeeds", async () => {
    const primary: Reasoner = {
      reason: vi.fn(async () => ({ thinking: "t", text: "bitdeer", model: "glm" })),
    };
    const secondary: Reasoner = {
      reason: vi.fn(async () => ({ thinking: "", text: "x", model: "y" })),
    };
    const out = await new FallbackReasoner(primary, secondary).reason("s");
    expect(out.text).toBe("bitdeer");
    expect(secondary.reason).not.toHaveBeenCalled();
  });
});
