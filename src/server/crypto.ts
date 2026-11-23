import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const PREFIX = "v1";

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY chưa được cấu hình");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("TOKEN_ENCRYPTION_KEY phải là 32 byte mã hoá base64");
  }
  return key;
}

/** Mã hoá chuỗi thành dạng `v1:iv:tag:ciphertext` (base64). */
export function encrypt(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_BYTES });
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv, tag, data].map((part) => (typeof part === "string" ? part : part.toString("base64"))).join(":");
}

export function decrypt(payload: string): string {
  const [prefix, ivText, tagText, data] = payload.split(":");
  const iv = Buffer.from(ivText ?? "", "base64");
  const tag = Buffer.from(tagText ?? "", "base64");
  if (prefix !== PREFIX || iv.length !== IV_BYTES || tag.length !== TAG_BYTES || !data) {
    throw new Error("Token đã mã hoá không đúng định dạng (thiếu tiền tố v1 hoặc sai độ dài). Hãy đăng nhập lại.");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function encryptOptional(value: string | null | undefined): string | null {
  return value ? encrypt(value) : null;
}
