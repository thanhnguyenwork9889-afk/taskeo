import { describe, expect, it } from "vitest";
import { DOC_KIND_LABEL } from "@/domain/labels";
import type { DocKind } from "@/domain/types";
import { DOCS_LIBRARY_TITLE, docsPageTitle, parseDocKindParam } from "./docs-params";

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

  it.each<[string, string[]]>([
    ["hai loại khác nhau", ["doc", "sheet"]],
    ["cùng một loại lặp lại", ["doc", "doc"]],
  ])("?type= lặp nhiều lần (%s) → null, coi như không lọc", (_label, value) => {
    expect(parseDocKindParam(value)).toBeNull();
  });
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
});
