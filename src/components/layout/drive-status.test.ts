import { describe, expect, it } from "vitest";
import { driveStatus } from "./drive-status";

describe("driveStatus", () => {
  it("hides the Drive control in demo mode", () => {
    expect(driveStatus({ isDemo: true, driveConnected: false })).toBe("hidden");
    expect(driveStatus({ isDemo: true, driveConnected: true })).toBe("hidden");
  });

  it("offers to connect when signed in without drive.file", () => {
    expect(driveStatus({ isDemo: false, driveConnected: false })).toBe("connect");
  });

  it("shows connected when drive.file is granted", () => {
    expect(driveStatus({ isDemo: false, driveConnected: true })).toBe("connected");
  });
});
