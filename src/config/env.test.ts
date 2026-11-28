import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_ENVS } from "./app";
import {
  AUTH_ENV_VARS,
  PICKER_ENV_VARS,
  getAuthMode,
  readPickerConfig,
  resolveAuthMode,
  type AuthEnvVar,
} from "./env";

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

describe("readPickerConfig", () => {
  const FULL = { GOOGLE_PICKER_API_KEY: "picker-key", GOOGLE_CLOUD_PROJECT_NUMBER: "123456789012" };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists exactly the two picker variables", () => {
    expect(PICKER_ENV_VARS).toEqual(["GOOGLE_PICKER_API_KEY", "GOOGLE_CLOUD_PROJECT_NUMBER"]);
  });

  it("returns developerKey and appId when both variables are set", () => {
    // Act
    const result = readPickerConfig(FULL);

    // Assert
    expect(result).toEqual({ developerKey: "picker-key", appId: "123456789012" });
  });

  it("trims surrounding whitespace", () => {
    // Act
    const result = readPickerConfig({
      GOOGLE_PICKER_API_KEY: "  picker-key\n",
      GOOGLE_CLOUD_PROJECT_NUMBER: "\t123456789012 ",
    });

    // Assert
    expect(result).toEqual({ developerKey: "picker-key", appId: "123456789012" });
  });

  it.each(PICKER_ENV_VARS)("returns null when %s is missing", (name) => {
    // Arrange
    const env: Record<string, string | undefined> = { ...FULL, [name]: undefined };

    // Act / Assert
    expect(readPickerConfig(env)).toBeNull();
  });

  it.each(PICKER_ENV_VARS)("returns null when %s is empty or whitespace only", (name) => {
    expect(readPickerConfig({ ...FULL, [name]: "" })).toBeNull();
    expect(readPickerConfig({ ...FULL, [name]: "   \t\n" })).toBeNull();
  });

  it.each(["12345abc", "project-taskeo", "123 456", "-123", "1.5e3"])(
    "returns null when the project number %j is not all digits",
    (value) => {
      expect(readPickerConfig({ ...FULL, GOOGLE_CLOUD_PROJECT_NUMBER: value })).toBeNull();
    },
  );

  it("returns null when nothing is set", () => {
    expect(readPickerConfig({})).toBeNull();
  });

  it("reads process.env by default", () => {
    // Arrange
    vi.stubEnv("GOOGLE_PICKER_API_KEY", "env-key");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT_NUMBER", "42");

    // Act
    const result = readPickerConfig();

    // Assert
    expect(result).toEqual({ developerKey: "env-key", appId: "42" });
  });
});
