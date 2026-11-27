import { afterEach, describe, expect, it, vi } from "vitest";

import { runWithDeadline } from "./deadline";

afterEach(() => {
  vi.useRealTimers();
});

describe("runWithDeadline", () => {
  it("xong trước hạn → ok, signal không bị huỷ, dọn timer", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const outcome = await runWithDeadline(
      async (signal) => {
        seen = signal;
        return 42;
      },
      100,
      "hết hạn",
    );
    expect(outcome).toEqual({ ok: true, value: 42 });
    expect(seen?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ném đồng bộ → ok: false với đúng lỗi, signal bị huỷ", async () => {
    const boom = new TypeError("x");
    let seen: AbortSignal | undefined;
    const outcome = await runWithDeadline(
      (signal) => {
        seen = signal;
        throw boom;
      },
      100,
      "hết hạn",
    );
    expect(outcome).toEqual({ ok: false, error: boom });
    expect(seen?.aborted).toBe(true);
  });

  it("hết hạn → TimeoutError (kể cả khi work reject AbortError lúc bị huỷ)", async () => {
    vi.useFakeTimers();
    const pending = runWithDeadline(
      (signal) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(Object.assign(new Error("a"), { name: "AbortError" })));
        }),
      100,
      "hết hạn",
    );
    await vi.advanceTimersByTimeAsync(100);
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error).toMatchObject({ name: "TimeoutError", message: "hết hạn" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
