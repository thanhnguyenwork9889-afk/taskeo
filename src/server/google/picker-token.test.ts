import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasGoogleScope: vi.fn(),
  getGoogleAuth: vi.fn(),
}));

vi.mock("./granted-scopes", () => ({ hasGoogleScope: mocks.hasGoogleScope }));
vi.mock("./client", () => ({ getGoogleAuth: mocks.getGoogleAuth }));

import {
  PICKER_TOKEN_TIMEOUT_MS,
  getPickerAccessToken,
  type PickerTokenDeps,
} from "./picker-token";
import { GOOGLE_SCOPES } from "./scopes";

const USER = "user-1";
const SECRET_TOKEN = "ya29.SECRET-ACCESS-TOKEN";
const EXPIRY_MS = Date.UTC(2026, 10, 27, 10, 30, 0);

function namedError(name: string): Error {
  const error = new Error(`chi tiết nội bộ ${SECRET_TOKEN}`);
  error.name = name;
  return error;
}

function fakeGaxiosError(status: number) {
  const error = namedError("GaxiosError") as Error & Record<string, unknown>;
  error.status = status;
  error.config = { headers: { Authorization: `Bearer ${SECRET_TOKEN}` } };
  error.response = { data: { access_token: SECRET_TOKEN } };
  return error;
}

function fakeDeps(overrides: Partial<PickerTokenDeps> = {}) {
  const hasDriveScope = vi.fn<PickerTokenDeps["hasDriveScope"]>().mockResolvedValue(true);
  const getAccessToken = vi
    .fn<PickerTokenDeps["getAccessToken"]>()
    .mockResolvedValue({ token: SECRET_TOKEN, expiryDate: EXPIRY_MS });
  const deps: PickerTokenDeps = { hasDriveScope, getAccessToken, ...overrides };
  return { deps, hasDriveScope, getAccessToken };
}

function loggedText(spy: ReturnType<typeof vi.spyOn>): string {
  return JSON.stringify(spy.mock.calls);
}

describe("getPickerAccessToken", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mocks.hasGoogleScope.mockReset();
    mocks.getGoogleAuth.mockReset();
  });

  it("returns not_connected without fetching a token when drive.file is not granted", async () => {
    // Arrange
    const { deps, hasDriveScope, getAccessToken } = fakeDeps();
    hasDriveScope.mockResolvedValue(false);

    // Act
    const result = await getPickerAccessToken(USER, deps);

    // Assert
    expect(result).toEqual({ status: "not_connected" });
    expect(hasDriveScope).toHaveBeenCalledWith(USER);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns the token with an ISO expiresAt from expiry_date", async () => {
    // Arrange
    const { deps, getAccessToken } = fakeDeps();

    // Act
    const result = await getPickerAccessToken(USER, deps);

    // Assert
    expect(result).toEqual({
      status: "ok",
      accessToken: SECRET_TOKEN,
      expiresAt: new Date(EXPIRY_MS).toISOString(),
    });
    expect(getAccessToken).toHaveBeenCalledWith(USER);
  });

  it.each([null, undefined])("returns expiresAt null when expiry_date is %s", async (expiryDate) => {
    // Arrange
    const { deps } = fakeDeps({
      getAccessToken: vi.fn().mockResolvedValue({ token: SECRET_TOKEN, expiryDate }),
    });

    // Act
    const result = await getPickerAccessToken(USER, deps);

    // Assert
    expect(result).toEqual({ status: "ok", accessToken: SECRET_TOKEN, expiresAt: null });
  });

  it("returns expiresAt null when expiry_date is not a valid timestamp", async () => {
    // Arrange
    const { deps } = fakeDeps({
      getAccessToken: vi.fn().mockResolvedValue({ token: SECRET_TOKEN, expiryDate: Number.NaN }),
    });

    // Act
    const result = await getPickerAccessToken(USER, deps);

    // Assert
    expect(result).toEqual({ status: "ok", accessToken: SECRET_TOKEN, expiresAt: null });
  });

  it.each(["", null, undefined])("returns error when the token is %j", async (token) => {
    // Arrange
    const { deps } = fakeDeps({
      getAccessToken: vi.fn().mockResolvedValue({ token, expiryDate: EXPIRY_MS }),
    });

    // Act
    const result = await getPickerAccessToken(USER, deps);

    // Assert
    expect(result).toEqual({ status: "error" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[1]).toEqual({ userId: USER, error: "EmptyAccessTokenError" });
  });

  it("returns not_connected without logging on GoogleNotConnectedError", async () => {
    // Arrange
    const { deps } = fakeDeps({
      getAccessToken: vi.fn().mockRejectedValue(namedError("GoogleNotConnectedError")),
    });

    // Act
    const result = await getPickerAccessToken(USER, deps);

    // Assert
    expect(result).toEqual({ status: "not_connected" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs one line without the token when the refresh fails with a Google error", async () => {
    // Arrange
    const { deps } = fakeDeps({ getAccessToken: vi.fn().mockRejectedValue(fakeGaxiosError(400)) });

    // Act
    const result = await getPickerAccessToken(USER, deps);

    // Assert
    expect(result).toEqual({ status: "error" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[1]).toEqual({ userId: USER, error: "GaxiosError", status: 400 });
    expect(loggedText(errorSpy)).not.toContain(SECRET_TOKEN);
  });

  it("logs only the error name for an unknown error carrying the token in its message", async () => {
    // Arrange
    const { deps } = fakeDeps({ getAccessToken: vi.fn().mockRejectedValue(namedError("Error")) });

    // Act
    const result = await getPickerAccessToken(USER, deps);

    // Assert
    expect(result).toEqual({ status: "error" });
    expect(errorSpy.mock.calls[0]?.[1]).toEqual({ userId: USER, error: "Error" });
    expect(loggedText(errorSpy)).not.toContain(SECRET_TOKEN);
  });

  it("returns error when the scope check itself fails", async () => {
    // Arrange
    const { deps, getAccessToken } = fakeDeps({
      hasDriveScope: vi.fn().mockRejectedValue(namedError("PrismaClientKnownRequestError")),
    });

    // Act
    const result = await getPickerAccessToken(USER, deps);

    // Assert
    expect(result).toEqual({ status: "error" });
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(loggedText(errorSpy)).not.toContain(SECRET_TOKEN);
  });

  it("returns error with a TimeoutError log when the token takes longer than the deadline", async () => {
    // Arrange
    vi.useFakeTimers();
    const { deps } = fakeDeps({
      getAccessToken: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    // Act
    const pending = getPickerAccessToken(USER, deps);
    await vi.advanceTimersByTimeAsync(PICKER_TOKEN_TIMEOUT_MS);
    const result = await pending;

    // Assert
    expect(PICKER_TOKEN_TIMEOUT_MS).toBe(10_000);
    expect(result).toEqual({ status: "error" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[1]).toEqual({ userId: USER, error: "TimeoutError" });
  });

  it("honours a custom deadline from deps", async () => {
    // Arrange
    vi.useFakeTimers();
    const { deps } = fakeDeps({
      getAccessToken: vi.fn().mockReturnValue(new Promise(() => {})),
      totalTimeoutMs: 50,
    });

    // Act
    const pending = getPickerAccessToken(USER, deps);
    await vi.advanceTimersByTimeAsync(50);

    // Assert
    expect(await pending).toEqual({ status: "error" });
  });

  describe("default deps", () => {
    it("checks drive.file and never loads the client when the scope is missing", async () => {
      // Arrange
      mocks.hasGoogleScope.mockResolvedValue(false);

      // Act
      const result = await getPickerAccessToken(USER);

      // Assert
      expect(result).toEqual({ status: "not_connected" });
      expect(mocks.hasGoogleScope).toHaveBeenCalledWith(USER, GOOGLE_SCOPES.drive);
      expect(mocks.getGoogleAuth).not.toHaveBeenCalled();
    });

    it("gets the token from getGoogleAuth(userId).getAccessToken() and reads expiry_date", async () => {
      // Arrange
      mocks.hasGoogleScope.mockResolvedValue(true);
      const getAccessToken = vi.fn().mockResolvedValue({ token: SECRET_TOKEN });
      mocks.getGoogleAuth.mockResolvedValue({ getAccessToken, credentials: { expiry_date: EXPIRY_MS } });

      // Act
      const result = await getPickerAccessToken(USER);

      // Assert
      expect(mocks.getGoogleAuth).toHaveBeenCalledWith(USER);
      expect(getAccessToken).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        status: "ok",
        accessToken: SECRET_TOKEN,
        expiresAt: new Date(EXPIRY_MS).toISOString(),
      });
    });
  });
});
