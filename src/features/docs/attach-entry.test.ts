import { describe, expect, it } from "vitest";
import { attachEntryAction } from "./attach-entry";

describe("attachEntryAction", () => {
  it("demo + có handler demo → demo_dialog", () => {
    expect(attachEntryAction(true, true)).toBe("demo_dialog");
  });

  it("demo không có handler → hidden (demo không bao giờ mở hộp thoại Picker)", () => {
    expect(attachEntryAction(true, false)).toBe("hidden");
  });

  it("configured → drive_dialog, bất kể có handler demo hay không", () => {
    expect(attachEntryAction(false, true)).toBe("drive_dialog");
    expect(attachEntryAction(false, false)).toBe("drive_dialog");
  });
});
