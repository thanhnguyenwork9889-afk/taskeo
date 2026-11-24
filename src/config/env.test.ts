import { describe, expect, it } from "vitest";
import { APP_ENVS } from "./app";
import { AUTH_ENV_VARS, resolveAuthMode } from "./env";

describe("resolveAuthMode", () => {
  it.each(APP_ENVS)("returns configured in %s when no auth variable is missing", (appEnv) => {
    // Act
    const result = resolveAuthMode(appEnv, []);

    // Assert
    expect(result).toBe("configured");
  });

  it.each([
    ["development", "demo"],
    ["staging", "misconfigured"],
    ["production", "misconfigured"],
  ] as const)("in %s returns %s when every auth variable is missing", (appEnv, expected) => {
    // Arrange
    const missing = [...AUTH_ENV_VARS];

    // Act
    const result = resolveAuthMode(appEnv, missing);

    // Assert
    expect(result).toBe(expected);
  });

  it.each(APP_ENVS)("returns misconfigured in %s when only some auth variables are missing", (appEnv) => {
    // Arrange
    const missing = ["AUTH_SECRET", "TOKEN_ENCRYPTION_KEY"];

    // Act
    const result = resolveAuthMode(appEnv, missing);

    // Assert
    expect(result).toBe("misconfigured");
  });
});
