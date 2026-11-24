import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_ENVS } from "./app";
import { AUTH_ENV_VARS, getAuthMode, resolveAuthMode, type AuthEnvVar } from "./env";

describe("resolveAuthMode", () => {
  it.each(APP_ENVS)("returns configured in %s when no auth variable is missing", (appEnv) => {
    // Act
    const result = resolveAuthMode(appEnv, [], "production");

    // Assert
    expect(result).toBe("configured");
  });

  it.each([
    ["development", "demo"],
    ["production", "misconfigured"],
  ] as const)("in %s returns %s when every auth variable is missing (non-production build)", (appEnv, expected) => {
    // Arrange
    const missing = [...AUTH_ENV_VARS];

    // Act
    const result = resolveAuthMode(appEnv, missing, "development");

    // Assert
    expect(result).toBe(expected);
  });

  it("returns misconfigured in development when every auth variable is missing but the build is production", () => {
    // Arrange
    const missing = [...AUTH_ENV_VARS];

    // Act
    const result = resolveAuthMode("development", missing, "production");

    // Assert
    expect(result).toBe("misconfigured");
  });

  it.each(["development", "test", undefined])(
    "returns demo in development when every auth variable is missing and NODE_ENV is %s",
    (nodeEnv) => {
      // Arrange
      const missing = [...AUTH_ENV_VARS];

      // Act
      const result = resolveAuthMode("development", missing, nodeEnv);

      // Assert
      expect(result).toBe("demo");
    },
  );

  it.each(APP_ENVS)("returns misconfigured in %s when only some auth variables are missing", (appEnv) => {
    // Arrange
    const missing: AuthEnvVar[] = ["AUTH_SECRET", "TOKEN_ENCRYPTION_KEY"];

    // Act
    const result = resolveAuthMode(appEnv, missing, "development");

    // Assert
    expect(result).toBe("misconfigured");
  });
});

describe("getAuthMode (reads process.env)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubAuthVars(value: (name: AuthEnvVar) => string): void {
    for (const name of AUTH_ENV_VARS) vi.stubEnv(name, value(name));
  }

  it("returns configured when all auth variables are set", () => {
    // Arrange
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    stubAuthVars((name) => `test-${name}`);

    // Act
    const result = getAuthMode();

    // Assert
    expect(result).toBe("configured");
  });

  it("returns demo when no auth variable is set, NODE_ENV=development and APP_ENV=development", () => {
    // Arrange
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    stubAuthVars(() => "");

    // Act
    const result = getAuthMode();

    // Assert
    expect(result).toBe("demo");
  });

  it("returns misconfigured when no auth variable is set, APP_ENV=development but NODE_ENV=production", () => {
    // Arrange
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    stubAuthVars(() => "");

    // Act
    const result = getAuthMode();

    // Assert
    expect(result).toBe("misconfigured");
  });
});
