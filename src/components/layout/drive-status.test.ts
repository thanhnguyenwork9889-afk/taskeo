import { describe, expect, it } from "vitest";
import { currentLocation, driveStatus } from "./drive-status";

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

describe("currentLocation", () => {
  it("returns the pathname alone when there is no query", () => {
    expect(currentLocation("/tasks", "")).toBe("/tasks");
    expect(currentLocation("/", "")).toBe("/");
  });

  it("treats a bare '?' or whitespace as no query", () => {
    expect(currentLocation("/tasks", "?")).toBe("/tasks");
    expect(currentLocation("/tasks", "   ")).toBe("/tasks");
  });

  it("appends a query given without the leading '?' (URLSearchParams.toString())", () => {
    expect(currentLocation("/tasks", "type=bug&page=2")).toBe("/tasks?type=bug&page=2");
  });

  it("accepts a query that already starts with '?' without doubling it", () => {
    expect(currentLocation("/tasks", "?type=bug")).toBe("/tasks?type=bug");
  });
});
