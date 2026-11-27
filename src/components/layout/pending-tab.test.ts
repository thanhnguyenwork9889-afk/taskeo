import { describe, expect, it, vi } from "vitest";
import { closePendingTab, finishPendingTab, openPendingTab, type PendingTab } from "./pending-tab";

const DRIVE_URL = "https://docs.google.com/document/d/f1/edit";

function fakeTab() {
  return { opener: {} as unknown, location: { href: "about:blank" }, close: vi.fn() };
}

describe("openPendingTab", () => {
  it("mở tab trống _blank, không truyền feature, đặt opener = null", () => {
    const tab = fakeTab();
    const open = vi.fn<(url: string, target: string) => typeof tab>(() => tab);
    expect(openPendingTab(open)).toBe(tab);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(open.mock.calls[0]).toHaveLength(2);
    expect(tab.opener).toBeNull();
  });

  it("bị chặn popup → null", () => {
    expect(openPendingTab(() => null)).toBeNull();
  });

  it("đặt opener ném lỗi → vẫn trả tab", () => {
    const tab = { location: { href: "" }, close: vi.fn() } as unknown as PendingTab;
    Object.defineProperty(tab, "opener", {
      set() {
        throw new Error("denied");
      },
    });
    expect(openPendingTab(() => tab)).toBe(tab);
  });

  it("open ném lỗi → null", () => {
    expect(
      openPendingTab(() => {
        throw new Error("x");
      }),
    ).toBeNull();
  });
});

describe("finishPendingTab", () => {
  it("url Drive hợp lệ → gán location, opened", () => {
    const tab = fakeTab();
    expect(finishPendingTab(tab, DRIVE_URL)).toBe("opened");
    expect(tab.location.href).toBe(DRIVE_URL);
    expect(tab.close).not.toHaveBeenCalled();
  });

  it("gán location ném lỗi → cố đóng tab, blocked", () => {
    const close = vi.fn();
    const tab = {
      opener: null,
      location: Object.defineProperty({} as { href: string }, "href", {
        set() {
          throw new Error("denied");
        },
      }),
      close,
    } as PendingTab;
    expect(finishPendingTab(tab, DRIVE_URL)).toBe("blocked");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("gán location lỗi và close cũng lỗi → vẫn blocked, không ném", () => {
    const tab = {
      opener: null,
      location: Object.defineProperty({} as { href: string }, "href", {
        set() {
          throw new Error("denied");
        },
      }),
      close() {
        throw new Error("closed");
      },
    } as PendingTab;
    expect(finishPendingTab(tab, DRIVE_URL)).toBe("blocked");
  });

  it("tab null → blocked", () => {
    expect(finishPendingTab(null, DRIVE_URL)).toBe("blocked");
  });

  it("url null / lạ → đóng tab, no_url, không gán location", () => {
    const tab = fakeTab();
    expect(finishPendingTab(tab, null)).toBe("no_url");
    expect(tab.close).toHaveBeenCalledTimes(1);
    const other = fakeTab();
    expect(finishPendingTab(other, "javascript:alert(1)")).toBe("no_url");
    expect(other.location.href).toBe("about:blank");
    expect(other.close).toHaveBeenCalledTimes(1);
    expect(finishPendingTab(null, null)).toBe("no_url");
  });
});

describe("closePendingTab", () => {
  it("đóng tab; null hoặc close ném lỗi → không ném", () => {
    const tab = fakeTab();
    closePendingTab(tab);
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(() => closePendingTab(null)).not.toThrow();
    const broken = fakeTab();
    broken.close.mockImplementation(() => {
      throw new Error("x");
    });
    expect(() => closePendingTab(broken)).not.toThrow();
  });
});
