import { describe, expect, it } from "vitest";
import { completedAtFor } from "./task-completion";

const NOW = new Date(2026, 10, 23, 9, 0);
const EARLIER = new Date(2026, 10, 20, 8, 0);

const cases = [
  { kind: "Date", now: NOW, earlier: EARLIER },
  { kind: "chuỗi ISO", now: NOW.toISOString(), earlier: EARLIER.toISOString() },
] as const;

describe.each(cases)("completedAtFor với $kind", ({ now, earlier }) => {
  it("TODO → DONE đặt completedAt = now", () => {
    expect(completedAtFor("TODO", null, "DONE", now)).toBe(now);
  });

  it("DONE → TODO xoá completedAt", () => {
    expect(completedAtFor("DONE", earlier, "TODO", now)).toBeNull();
  });

  it("DONE → DONE giữ giá trị cũ", () => {
    expect(completedAtFor("DONE", earlier, "DONE", now)).toBe(earlier);
  });

  it("nextStatus undefined giữ giá trị cũ", () => {
    expect(completedAtFor("DONE", earlier, undefined, now)).toBe(earlier);
    expect(completedAtFor("TODO", null, undefined, now)).toBeNull();
  });

  it("IN_PROGRESS → PAUSED giữ null", () => {
    expect(completedAtFor("IN_PROGRESS", null, "PAUSED", now)).toBeNull();
  });

  it("tạo mới: DONE = now, TODO = null", () => {
    expect(completedAtFor("TODO", null, "DONE", now)).toBe(now);
    expect(completedAtFor("TODO", null, "TODO", now)).toBeNull();
  });
});
