import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_FOLDER_NAME,
  DEFAULT_SPACE_FOLDER_NAME,
  DRIVE_FOLDER_NAME_MAX,
  toDriveFolderName,
} from "./drive-folder-name";

const FALLBACK = DEFAULT_SPACE_FOLDER_NAME;
const INVISIBLE = /[\p{Cc}\p{Cf}]/u;

describe("toDriveFolderName", () => {
  it("exposes the agreed constants", () => {
    expect(DRIVE_FOLDER_NAME_MAX).toBe(200);
    expect(DEFAULT_SPACE_FOLDER_NAME).toBe("Không gian không tên");
    expect(DEFAULT_PROJECT_FOLDER_NAME).toBe("Dự án không tên");
  });

  it("trims surrounding whitespace", () => {
    expect(toDriveFolderName("  Học tập  ", FALLBACK)).toBe("Học tập");
  });

  it("collapses runs of whitespace into one space", () => {
    expect(toDriveFolderName("Dự   án    Bán lẻ", FALLBACK)).toBe("Dự án Bán lẻ");
  });

  it("turns control characters into spaces", () => {
    expect(toDriveFolderName("a\nb\tc\u0000d\u007Fe\u0085f", FALLBACK)).toBe("a b c d e f");
  });

  it("removes bidi override and zero-width characters", () => {
    const result = toDriveFolderName("abc‮def​ghi", FALLBACK);
    expect(result).toBe("abc def ghi");
    expect(INVISIBLE.test(result)).toBe(false);
  });

  it("returns the fallback for empty or whitespace-only input", () => {
    expect(toDriveFolderName("", FALLBACK)).toBe(FALLBACK);
    expect(toDriveFolderName("   ", DEFAULT_PROJECT_FOLDER_NAME)).toBe(DEFAULT_PROJECT_FOLDER_NAME);
  });

  it("returns the fallback when only control characters remain", () => {
    expect(toDriveFolderName("\u0000\n​‮\t", FALLBACK)).toBe(FALLBACK);
  });

  it("cuts long names to the maximum code points", () => {
    const result = toDriveFolderName("a".repeat(250), FALLBACK);
    expect(Array.from(result)).toHaveLength(DRIVE_FOLDER_NAME_MAX);
  });

  it("does not split surrogate pairs when cutting", () => {
    const result = toDriveFolderName("😀".repeat(250), FALLBACK);
    expect(Array.from(result)).toHaveLength(DRIVE_FOLDER_NAME_MAX);
    expect(result).toBe("😀".repeat(DRIVE_FOLDER_NAME_MAX));
  });

  it("trims again after cutting", () => {
    const raw = `${"a".repeat(DRIVE_FOLDER_NAME_MAX - 1)} bcd`;
    expect(toDriveFolderName(raw, FALLBACK)).toBe("a".repeat(DRIVE_FOLDER_NAME_MAX - 1));
  });

  it("normalizes to NFC", () => {
    const result = toDriveFolderName("Café", FALLBACK);
    expect(result).toBe("Café");
    expect(result).toHaveLength(4);
  });

  it("keeps slashes and Vietnamese characters", () => {
    expect(toDriveFolderName("Kế hoạch 2026/Quý 4 – Đặng", FALLBACK)).toBe("Kế hoạch 2026/Quý 4 – Đặng");
  });

  it("does not mutate its input", () => {
    const raw = "  Tên  ";
    toDriveFolderName(raw, FALLBACK);
    expect(raw).toBe("  Tên  ");
  });
});
