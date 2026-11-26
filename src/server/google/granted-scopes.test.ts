import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  account: { findFirst: vi.fn() },
}));

vi.mock("@/server/db", () => ({ prisma: db }));

import {
  GOOGLE_ACCOUNT_ORDER,
  GoogleScopeMissingError,
  getGrantedGoogleScopes,
  hasGoogleScope,
  requireGoogleScope,
} from "./granted-scopes";
import { GOOGLE_SCOPES } from "./scopes";

const USER = "user-1";
const DRIVE = GOOGLE_SCOPES.drive;
const BASE = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

function mockScope(scope: string | null) {
  db.account.findFirst.mockResolvedValue({ scope });
}

function expectQueriedFor(userId: string) {
  expect(db.account.findFirst).toHaveBeenCalledTimes(1);
  expect(db.account.findFirst).toHaveBeenCalledWith({
    where: { userId, provider: "google" },
    orderBy: { createdAt: "asc" },
    select: { scope: true },
  });
}

beforeEach(() => {
  db.account.findFirst.mockReset();
});

describe("getGrantedGoogleScopes", () => {
  it("tách Account.scope theo khoảng trắng, bỏ chuỗi rỗng", async () => {
    mockScope(`  ${BASE}   ${DRIVE} `);
    await expect(getGrantedGoogleScopes(USER)).resolves.toEqual([...BASE.split(" "), DRIVE]);
    expectQueriedFor(USER);
  });

  it("scope null → []", async () => {
    mockScope(null);
    await expect(getGrantedGoogleScopes(USER)).resolves.toEqual([]);
    expectQueriedFor(USER);
  });

  it("không có account → []", async () => {
    db.account.findFirst.mockResolvedValue(null);
    await expect(getGrantedGoogleScopes(USER)).resolves.toEqual([]);
    expectQueriedFor(USER);
  });
});

describe("hasGoogleScope", () => {
  it("có drive.file → true", async () => {
    mockScope(`${BASE} ${DRIVE}`);
    await expect(hasGoogleScope(USER, DRIVE)).resolves.toBe(true);
    expectQueriedFor(USER);
  });

  it("thiếu drive.file → false", async () => {
    mockScope(BASE);
    await expect(hasGoogleScope(USER, DRIVE)).resolves.toBe(false);
    expectQueriedFor(USER);
  });

  it("không khớp tiền tố (drive.file.extra) → false", async () => {
    mockScope(`${BASE} ${DRIVE}.extra`);
    await expect(hasGoogleScope(USER, DRIVE)).resolves.toBe(false);
  });

  it("scope null → false", async () => {
    mockScope(null);
    await expect(hasGoogleScope(USER, DRIVE)).resolves.toBe(false);
    expectQueriedFor(USER);
  });

  it("không có account → false", async () => {
    db.account.findFirst.mockResolvedValue(null);
    await expect(hasGoogleScope(USER, DRIVE)).resolves.toBe(false);
    expectQueriedFor(USER);
  });

  it("luôn lọc theo đúng userId", async () => {
    mockScope(DRIVE);
    await hasGoogleScope("user-other", DRIVE);
    expectQueriedFor("user-other");
  });
});

describe("requireGoogleScope", () => {
  it("không ném khi đã cấp", async () => {
    mockScope(`${BASE} ${DRIVE}`);
    await expect(requireGoogleScope(USER, DRIVE)).resolves.toBeUndefined();
    expectQueriedFor(USER);
  });

  it("ném GoogleScopeMissingError kèm scope khi thiếu", async () => {
    mockScope(BASE);
    const error = await requireGoogleScope(USER, DRIVE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoogleScopeMissingError);
    expect(error).toBeInstanceOf(Error);
    const missing = error as GoogleScopeMissingError;
    expect(missing.scope).toBe(DRIVE);
    expect(missing.name).toBe("GoogleScopeMissingError");
    expectQueriedFor(USER);
  });

  it("ném khi không có account", async () => {
    db.account.findFirst.mockResolvedValue(null);
    await expect(requireGoogleScope(USER, DRIVE)).rejects.toBeInstanceOf(GoogleScopeMissingError);
  });
});

describe("GOOGLE_ACCOUNT_ORDER", () => {
  it("chọn tài khoản Google liên kết đầu tiên (createdAt tăng dần)", () => {
    expect(GOOGLE_ACCOUNT_ORDER).toEqual({ createdAt: "asc" });
  });

  it("tab và xuống dòng trong Account.scope vẫn tách đúng", async () => {
    mockScope(`openid	${DRIVE}
`);
    await expect(getGrantedGoogleScopes(USER)).resolves.toEqual(["openid", DRIVE]);
    await expect(hasGoogleScope(USER, DRIVE)).resolves.toBe(true);
  });
});

describe("GoogleScopeMissingError", () => {
  it("message tiếng Việt thân thiện, không lộ user hay token", () => {
    const error = new GoogleScopeMissingError(DRIVE);
    expect(error.message).toBe("Chưa cấp quyền Google Drive. Hãy kết nối lại.");
    expect(error.message).not.toContain(USER);
  });

  it("scope khác dùng message chung", () => {
    const error = new GoogleScopeMissingError(GOOGLE_SCOPES.calendarRead);
    expect(error.scope).toBe(GOOGLE_SCOPES.calendarRead);
    expect(error.message).toBe("Chưa cấp quyền Google Calendar. Hãy kết nối lại.");
  });
});
