import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_ENVS, APP_NAME, appEnvLabel, appTitle, getAppEnv, resolveAppEnv } from "./app";

describe("resolveAppEnv", () => {
  it.each(APP_ENVS)("returns %s when NEXT_PUBLIC_APP_ENV is set to it", (env) => {
    // Arrange
    const input = { appEnv: env, vercelEnv: undefined, nodeEnv: "production" };

    // Act
    const result = resolveAppEnv(input);

    // Assert
    expect(result).toBe(env);
  });

  it("prefers NEXT_PUBLIC_APP_ENV over NEXT_PUBLIC_VERCEL_ENV", () => {
    // Arrange
    const input = { appEnv: "staging", vercelEnv: "production", nodeEnv: "production" };

    // Act
    const result = resolveAppEnv(input);

    // Assert
    expect(result).toBe("staging");
  });

  it.each([
    ["production", "production"],
    ["preview", "staging"],
    ["development", "development"],
  ] as const)("maps NEXT_PUBLIC_VERCEL_ENV=%s to %s when APP_ENV is absent", (vercelEnv, expected) => {
    // Arrange
    const input = { appEnv: "", vercelEnv, nodeEnv: "production" };

    // Act
    const result = resolveAppEnv(input);

    // Assert
    expect(result).toBe(expected);
  });

  it("falls back to production when only NODE_ENV is production", () => {
    // Arrange
    const input = { nodeEnv: "production" };

    // Act
    const result = resolveAppEnv(input);

    // Assert
    expect(result).toBe("production");
  });

  it("falls back to development when NODE_ENV is something other than production", () => {
    // Arrange
    const input = { nodeEnv: "test" };

    // Act
    const result = resolveAppEnv(input);

    // Assert
    expect(result).toBe("development");
  });

  it("falls back to development when no variable is set", () => {
    // Arrange
    const input = {};

    // Act
    const result = resolveAppEnv(input);

    // Assert
    expect(result).toBe("development");
  });

  it("throws an error naming NEXT_PUBLIC_APP_ENV, the bad value and valid values when APP_ENV is invalid", () => {
    // Arrange
    const input = { appEnv: "prod", vercelEnv: "production" };

    // Act
    const act = () => resolveAppEnv(input);

    // Assert
    expect(act).toThrow(/NEXT_PUBLIC_APP_ENV/);
    expect(act).toThrow(/"prod"/);
    expect(act).toThrow(/development, staging, production/);
  });

  it("throws an error naming NEXT_PUBLIC_VERCEL_ENV when VERCEL_ENV is invalid", () => {
    // Arrange
    const input = { vercelEnv: "qa" };

    // Act
    const act = () => resolveAppEnv(input);

    // Assert
    expect(act).toThrow(/NEXT_PUBLIC_VERCEL_ENV/);
    expect(act).toThrow(/"qa"/);
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "throws for NEXT_PUBLIC_VERCEL_ENV=%s instead of reading an inherited Object property",
    (vercelEnv) => {
      // Arrange
      const input = { vercelEnv };

      // Act
      const act = () => resolveAppEnv(input);

      // Assert
      expect(act).toThrow(/NEXT_PUBLIC_VERCEL_ENV/);
    },
  );
});

describe("getAppEnv (reads process.env)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads NEXT_PUBLIC_APP_ENV", () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");

    // Act
    const result = getAppEnv();

    // Assert
    expect(result).toBe("staging");
  });

  it("falls back to NEXT_PUBLIC_VERCEL_ENV when NEXT_PUBLIC_APP_ENV is empty", () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("NODE_ENV", "production");

    // Act
    const result = getAppEnv();

    // Assert
    expect(result).toBe("staging");
  });

  it("falls back to NODE_ENV when both public variables are empty", () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");

    // Act
    const result = getAppEnv();

    // Assert
    expect(result).toBe("production");
  });
});

describe("appEnvLabel and appTitle", () => {
  it.each([
    ["development", "Dev", `${APP_NAME} · Dev`],
    ["staging", "Staging", `${APP_NAME} · Staging`],
    ["production", null, APP_NAME],
  ] as const)("for %s returns label %s and title %s", (env, label, title) => {
    // Act
    const resultLabel = appEnvLabel(env);
    const resultTitle = appTitle(env);

    // Assert
    expect(resultLabel).toBe(label);
    expect(resultTitle).toBe(title);
  });

  it("uses Taskeo as the app name", () => {
    expect(APP_NAME).toBe("Taskeo");
    expect(appTitle("staging")).toBe("Taskeo · Staging");
  });
});
