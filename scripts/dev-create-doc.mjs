// CHỈ DÙNG Ở DEV. Không bao giờ chạy hay import trong production.
//
// Tạo một Google Doc / Sheet / Slide trống trong thư mục Drive của một không gian, để thử tính năng
// liệt kê file (T015) với scope drive.file (app chỉ thấy file do chính app tạo).
//
// Cách dùng:
//   node --env-file=.env.local scripts/dev-create-doc.mjs <email> <spaceId> [doc|sheet|slide] [name]
//
// Cần: DATABASE_URL, TOKEN_ENCRYPTION_KEY, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET; người dùng đã kết nối Drive.
//
// Script cố ý lặp lại logic giải mã token của src/server/crypto.ts thay vì import, vì src/ dùng
// "server-only" và alias `@/` mà Node chạy trực tiếp không hiểu. Nếu định dạng trong crypto.ts đổi,
// phải sửa ở đây theo.
//
// An toàn: không in token, không ghi token ra đâu cả; lỗi chỉ in tên lỗi và mã HTTP.

import { createDecipheriv } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

// Giống GOOGLE_ACCOUNT_ORDER trong src/server/google/granted-scopes.ts.
const GOOGLE_ACCOUNT_ORDER = { createdAt: "asc" };

const MIME_TYPES = {
  doc: "application/vnd.google-apps.document",
  sheet: "application/vnd.google-apps.spreadsheet",
  slide: "application/vnd.google-apps.presentation",
};

const DEFAULT_NAMES = {
  doc: "Taskeo dev doc",
  sheet: "Taskeo dev sheet",
  slide: "Taskeo dev slide",
};

const USAGE =
  "Cách dùng: node --env-file=.env.local scripts/dev-create-doc.mjs <email> <spaceId> [doc|sheet|slide] [name]";

// --- Giải mã: bản sao của src/server/crypto.ts (định dạng `v1:iv:tag:ciphertext`, base64) ---
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const PREFIX = "v1";

function getKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY chưa được cấu hình");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("TOKEN_ENCRYPTION_KEY phải là 32 byte mã hoá base64");
  }
  return key;
}

function decrypt(payload) {
  const [prefix, ivText, tagText, data] = payload.split(":");
  const iv = Buffer.from(ivText ?? "", "base64");
  const tag = Buffer.from(tagText ?? "", "base64");
  if (prefix !== PREFIX || iv.length !== IV_BYTES || tag.length !== TAG_BYTES || !data) {
    throw new Error("Token đã mã hoá không đúng định dạng (thiếu tiền tố v1 hoặc sai độ dài).");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
// --- Hết phần sao chép ---

/** Lỗi do script tự đặt thông điệp (không chứa dữ liệu nhạy cảm), được phép in nguyên văn. */
class CliError extends Error {}

/** Ném thay vì process.exit để khối finally (prisma.$disconnect) vẫn chạy. */
function fail(message) {
  throw new CliError(message);
}

function parseArgs(argv) {
  const [email, spaceId, kindArg, ...nameParts] = argv;
  if (!email || !email.includes("@") || !spaceId) fail(USAGE);
  const kind = kindArg ?? "doc";
  if (!Object.hasOwn(MIME_TYPES, kind)) fail(`Loại không hợp lệ: "${kind}".\n${USAGE}`);
  const name = nameParts.join(" ").trim() || DEFAULT_NAMES[kind];
  return { email: email.trim(), spaceId: spaceId.trim(), kind, name };
}

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) fail(`Thiếu biến môi trường: ${missing.join(", ")} (chạy với --env-file=.env.local).`);
}

/** Chỉ in tên lỗi và mã HTTP, không in message (có thể chứa dữ liệu nhạy cảm từ Google). */
function describeError(error) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const status = error?.response?.status ?? error?.status ?? error?.code;
  return status ? `${name} (status ${status})` : name;
}

async function main() {
  const { email, spaceId, kind, name } = parseArgs(process.argv.slice(2));
  requireEnv(["DATABASE_URL", "TOKEN_ENCRYPTION_KEY", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]);

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) fail("Không tìm thấy người dùng với email này.");

    const space = await prisma.space.findFirst({
      where: { id: spaceId, userId: user.id },
      select: { id: true, name: true, driveFolderId: true },
    });
    if (!space) fail("Không tìm thấy không gian này của người dùng.");
    if (!space.driveFolderId) fail("Không gian chưa có thư mục Drive (driveFolderId trống).");

    const account = await prisma.account.findFirst({
      where: { userId: user.id, provider: "google" },
      orderBy: GOOGLE_ACCOUNT_ORDER,
      select: { scope: true, refresh_token: true },
    });
    if (!account) fail("Người dùng chưa liên kết tài khoản Google.");
    const scopes = (account.scope ?? "").split(/\s+/).filter((scope) => scope.length > 0);
    if (!scopes.includes(DRIVE_FILE_SCOPE)) fail("Người dùng chưa cấp quyền Google Drive (drive.file). Hãy kết nối Drive trong app.");
    if (!account.refresh_token) fail("Tài khoản Google không có refresh token. Hãy kết nối lại.");

    const oauth2 = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
    // Chỉ đặt refresh token; thư viện tự lấy access token mới khi gọi API.
    // Script KHÔNG ghi token mới (access token / refresh token xoay vòng) ngược vào DB.
    oauth2.setCredentials({ refresh_token: decrypt(account.refresh_token) });

    const drive = google.drive({ version: "v3", auth: oauth2 });
    const { data } = await drive.files.create({
      requestBody: { name, mimeType: MIME_TYPES[kind], parents: [space.driveFolderId] },
      fields: "id,name,webViewLink",
    });

    console.log(`id: ${data.id}`);
    console.log(`name: ${data.name}`);
    console.log(`webViewLink: ${data.webViewLink}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof CliError ? error.message : `Lỗi: ${describeError(error)}`);
  process.exitCode = 1;
});
