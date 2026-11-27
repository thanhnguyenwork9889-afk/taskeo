import type { DriveStorage } from "@/domain/types";

// Hàm thuần cho dung lượng Google Drive (T016): đọc `storageQuota` của `about.get`,
// tính phần trăm, mức cảnh báo và định dạng byte kiểu vi-VN. Dùng chung cho server và client.

/** `storageQuota` thô của Drive `about.get`: số int64 dạng chuỗi, trường có thể vắng. */
export interface RawStorageQuota {
  limit?: string | null;
  usage?: string | null;
  usageInDrive?: string | null;
  usageInDriveTrash?: string | null;
}

/** Mức cảnh báo theo phần trăm đã dùng. */
export type StorageLevel = "normal" | "warning" | "danger";

/** Chữ đứng trước số dung lượng đã dùng. */
export const STORAGE_USED_LABEL = "Đã dùng";

/** Ngưỡng % (bao gồm) để chuyển sang `warning` / `danger`. */
export const STORAGE_WARNING_PERCENT = 75;
export const STORAGE_DANGER_PERCENT = 90;

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const DIGITS = /^\d+$/;

/** Chuỗi chữ số thập phân không âm, an toàn trong `Number` → số; sai → `undefined`. */
function parseByteString(value: string): number | undefined {
  if (!DIGITS.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Trường tuỳ chọn: vắng / null → `fallback`; có mặt mà sai → `undefined`. */
function parseOptional(value: string | null | undefined, fallback: number): number | undefined {
  if (value === undefined || value === null) return fallback;
  return parseByteString(value);
}

/** `limit` vắng / null / "" / "0" → `null` (không giới hạn); sai định dạng → `undefined`. */
function parseLimit(value: string | null | undefined): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const parsed = parseByteString(value);
  if (parsed === undefined) return undefined;
  return parsed === 0 ? null : parsed;
}

/**
 * `storageQuota` thô → `DriveStorage`. `usage` bắt buộc. `limit` vắng / rỗng → không giới hạn;
 * `limit` = "0" cũng coi là không giới hạn (Google không trả 0 cho tài khoản có giới hạn).
 * `usageInDrive` / `usageInDriveTrash` vắng → 0. Trường có mặt mà sai định dạng → `null`.
 */
export function parseStorageQuota(raw: RawStorageQuota | null | undefined): DriveStorage | null {
  if (!raw || typeof raw.usage !== "string") return null;
  const usage = parseByteString(raw.usage);
  const limit = parseLimit(raw.limit);
  const usageInDrive = parseOptional(raw.usageInDrive, 0);
  const usageInDriveTrash = parseOptional(raw.usageInDriveTrash, 0);
  if (usage === undefined || limit === undefined) return null;
  if (usageInDrive === undefined || usageInDriveTrash === undefined) return null;
  return { usage, limit, usageInDrive, usageInDriveTrash };
}

/** Phần trăm đã dùng, kẹp 0–100, không làm tròn; `null` khi không giới hạn. */
export function storagePercent(s: DriveStorage): number | null {
  if (s.limit === null || s.limit <= 0) return null;
  return Math.min(100, Math.max(0, (s.usage / s.limit) * 100));
}

/** Mức cảnh báo: `null` → normal, ≥ 90 → danger, ≥ 75 → warning. */
export function storageLevel(percent: number | null): StorageLevel {
  if (percent === null) return "normal";
  if (percent >= STORAGE_DANGER_PERCENT) return "danger";
  if (percent >= STORAGE_WARNING_PERCENT) return "warning";
  return "normal";
}

/** < 10 → tối đa 1 chữ số thập phân, ≥ 10 → số nguyên. */
function roundForUnit(value: number): number {
  return value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
}

/**
 * Số byte → chuỗi vi-VN, cơ số 1024, B…TB (vd "1,5 KB", "850 MB", "15 GB").
 * Số âm / NaN / Infinity → "0 B". Làm tròn chạm 1024 thì lên đơn vị kế.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let unit = 0;
  let value = bytes;
  while (unit < BYTE_UNITS.length - 1 && roundForUnit(value) >= 1024) {
    value /= 1024;
    unit += 1;
  }
  const text = String(roundForUnit(value)).replace(".", ",");
  return `${text} ${BYTE_UNITS[unit]}`;
}

/** "Đã dùng X / Y"; không giới hạn → "Đã dùng X". */
export function formatStorageUsage(s: DriveStorage): string {
  const used = `${STORAGE_USED_LABEL} ${formatBytes(s.usage)}`;
  return s.limit === null ? used : `${used} / ${formatBytes(s.limit)}`;
}
