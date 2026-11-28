import { describe, expect, it } from "vitest";
import { DOC_KIND_LABEL } from "@/domain/labels";
import type { DocKind } from "@/domain/types";
import { DOCS_LIBRARY_TITLE, docsPageTitle, parseDocKindParam } from "./docs-params";

/**
 * Đầu vào ác ý / ký tự lạ trong `?type=`. Dùng chung cho hai describe bên dưới: parser phải trả
 * `null`, và tiêu đề trang phải vẫn là một trong bốn chuỗi cố định — giá trị thô của người dùng
 * không bao giờ ra tới `<title>`.
 */
const HOSTILE_TYPE_PARAMS: Array<[label: string, value: string]> = [
  ["thử thoát khỏi thẻ title", "</title><script>alert(1)</script>"],
  ["null byte dính đuôi", "doc\u0000"],
  ["zero-width space ở đầu (trim() không bỏ ký tự này)", "\u200bdoc"],
  ["chuỗi rất dài", "d".repeat(10000)],
];

describe("parseDocKindParam", () => {
  it.each<[string, DocKind]>([
    ["doc", "doc"],
    ["sheet", "sheet"],
    ["slide", "slide"],
  ])("nhận đúng loại %s", (value, expected) => {
    expect(parseDocKindParam(value)).toBe(expected);
  });

  it.each<[string, string | string[] | null | undefined]>([
    ["null", null],
    ["undefined", undefined],
    ["chuỗi rỗng", ""],
    ["chỉ có khoảng trắng", "  "],
    ["giá trị lạ", "xyz"],
    ["viết hoa (phân biệt hoa thường)", "DOC"],
  ])("%s → null", (_label, value) => {
    expect(parseDocKindParam(value)).toBeNull();
  });

  it("cắt khoảng trắng hai đầu trước khi kiểm", () => {
    expect(parseDocKindParam(" doc ")).toBe("doc");
  });

  it("mảng rỗng → null", () => {
    expect(parseDocKindParam([])).toBeNull();
  });

  it("mảng đúng một phần tử hợp lệ → loại đó", () => {
    expect(parseDocKindParam(["doc"])).toBe("doc");
  });

  it("mảng một phần tử cũng được cắt khoảng trắng hai đầu", () => {
    expect(parseDocKindParam(["  doc  "])).toBe("doc");
  });

  it("mảng một phần tử không hợp lệ → null", () => {
    expect(parseDocKindParam(["xyz"])).toBeNull();
  });

  it.each<[string, string[]]>([
    ["hai loại khác nhau", ["doc", "sheet"]],
    ["cùng một loại lặp lại", ["doc", "doc"]],
  ])("?type= lặp nhiều lần (%s) → null, coi như không lọc", (_label, value) => {
    expect(parseDocKindParam(value)).toBeNull();
  });

  it.each(HOSTILE_TYPE_PARAMS)(
    "đầu vào ác ý (%s) → null, giá trị thô không lọt qua parser",
    (_label, value) => {
      expect(parseDocKindParam(value)).toBeNull();
    },
  );
});

describe("docsPageTitle", () => {
  it.each<DocKind>(["doc", "sheet", "slide"])("loại %s → nhãn tiếng Việt", (kind) => {
    expect(docsPageTitle(kind)).toBe(DOC_KIND_LABEL[kind]);
  });

  it("không lọc theo loại → Kho lưu trữ", () => {
    expect(docsPageTitle(null)).toBe("Kho lưu trữ");
    expect(DOCS_LIBRARY_TITLE).toBe("Kho lưu trữ");
  });
});

describe("docsPageTitle(parseDocKindParam(...))", () => {
  it.each<[string | undefined, string]>([
    ["doc", "Soạn thảo"],
    ["sheet", "Bảng tính"],
    ["slide", "Trình chiếu"],
    [undefined, "Kho lưu trữ"],
    ["xyz", "Kho lưu trữ"],
  ])("?type=%s → tiêu đề %s", (value, expected) => {
    expect(docsPageTitle(parseDocKindParam(value))).toBe(expected);
  });

  it.each(HOSTILE_TYPE_PARAMS)(
    "đầu vào ác ý (%s) → tiêu đề vẫn là chuỗi cố định, không chứa giá trị thô",
    (_label, value) => {
      expect(docsPageTitle(parseDocKindParam(value))).toBe(DOCS_LIBRARY_TITLE);
    },
  );
});
