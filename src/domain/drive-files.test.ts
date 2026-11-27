import { describe, expect, it } from "vitest";
import {
  DEFAULT_DRIVE_FILE_NAME,
  DOC_KIND_MIME,
  DRIVE_FILE_CREATE_FIELDS,
  DRIVE_FILE_UNNAMED,
  DRIVE_NOT_CONNECTED_CODE,
  DRIVE_PARENTS_PER_QUERY,
  buildDriveFilesQuery,
  buildFolderIndex,
  chunk,
  docKindFromMime,
  escapeDriveQueryValue,
  mergeRecent,
  toDriveFileItem,
  toDriveFileName,
  type FolderSpace,
} from "./drive-files";
import type { DriveFileItem } from "./types";

const DOC_MIME = "application/vnd.google-apps.document";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const SLIDE_MIME = "application/vnd.google-apps.presentation";
const ALL_KINDS = `(mimeType='${DOC_MIME}' or mimeType='${SHEET_MIME}' or mimeType='${SLIDE_MIME}')`;

const SPACES: FolderSpace[] = [
  {
    id: "s1",
    name: "Học tập",
    driveFolderId: "fs1",
    projects: [
      { id: "p1", name: "Luận văn", driveFolderId: "fp1" },
      { id: "p2", name: "Chưa có thư mục", driveFolderId: null },
    ],
  },
  { id: "s2", name: "Công việc", driveFolderId: null, projects: [{ id: "p3", name: "Bán lẻ", driveFolderId: "fp3" }] },
];

function raw(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    name: "Đề cương",
    mimeType: DOC_MIME,
    modifiedTime: "2026-11-27T08:00:00.000Z",
    webViewLink: "https://docs.google.com/document/d/f1/edit",
    parents: ["fs1"],
    ...overrides,
  };
}

function item(id: string, modifiedAt: string): DriveFileItem {
  return {
    id,
    name: id,
    kind: "doc",
    url: null,
    modifiedAt,
    spaceId: "s1",
    projectId: null,
    spaceName: "Học tập",
    projectName: null,
  };
}

describe("constants", () => {
  it("exposes the agreed values", () => {
    expect(DOC_KIND_MIME).toEqual({ doc: DOC_MIME, sheet: SHEET_MIME, slide: SLIDE_MIME });
    expect(DRIVE_PARENTS_PER_QUERY).toBe(40);
    expect(DRIVE_NOT_CONNECTED_CODE).toBe("drive_not_connected");
    expect(DRIVE_FILE_UNNAMED).toBe("Không có tên");
    expect(DEFAULT_DRIVE_FILE_NAME).toBe("Tài liệu không tên");
    expect(DRIVE_FILE_CREATE_FIELDS).toBe("id,name,mimeType,modifiedTime,webViewLink,parents");
  });
});

describe("docKindFromMime", () => {
  it("maps the three Google mime types", () => {
    expect(docKindFromMime(DOC_MIME)).toBe("doc");
    expect(docKindFromMime(SHEET_MIME)).toBe("sheet");
    expect(docKindFromMime(SLIDE_MIME)).toBe("slide");
  });

  it.each([[undefined], [null], [""], ["  "], ["application/pdf"], ["application/vnd.google-apps.folder"], [`${DOC_MIME} `]])(
    "returns null for %j",
    (mime) => {
      expect(docKindFromMime(mime)).toBeNull();
    },
  );

  it("does not match inherited object keys", () => {
    expect(docKindFromMime("toString")).toBeNull();
    expect(docKindFromMime("constructor")).toBeNull();
  });
});

describe("escapeDriveQueryValue", () => {
  it("giữ nguyên chuỗi thường và tiếng Việt", () => {
    expect(escapeDriveQueryValue("Không gian 1")).toBe("Không gian 1");
    expect(escapeDriveQueryValue("")).toBe("");
  });

  it("thoát dấu nháy đơn", () => {
    expect(escapeDriveQueryValue("it's")).toBe("it\\'s");
  });

  it("thoát dấu gạch chéo ngược", () => {
    expect(escapeDriveQueryValue("a\\b")).toBe("a\\\\b");
  });

  it("thoát \\ trước ' (không thoát hai lần)", () => {
    // Đầu vào: \'  → \\\'
    expect(escapeDriveQueryValue("\\'")).toBe("\\\\\\'");
    expect(escapeDriveQueryValue("'\\")).toBe("\\'\\\\");
  });

  it("không thể thoát khỏi chuỗi bằng ' or ...", () => {
    const out = escapeDriveQueryValue("x' or trashed=true or name='y");
    expect(out).toBe("x\\' or trashed=true or name=\\'y");
    // Mọi ' đều có \ đứng trước.
    expect(/(^|[^\\])'/.test(out)).toBe(false);
  });
});

describe("buildDriveFilesQuery", () => {
  it("lists all three kinds when no kind and no parents", () => {
    expect(buildDriveFilesQuery({})).toBe(`${ALL_KINDS} and trashed=false`);
  });

  it("filters one kind", () => {
    expect(buildDriveFilesQuery({ kind: "sheet" })).toBe(`mimeType='${SHEET_MIME}' and trashed=false`);
  });

  it("ignores an empty parent list", () => {
    expect(buildDriveFilesQuery({ parentIds: [] })).toBe(`${ALL_KINDS} and trashed=false`);
  });

  it("adds one parent", () => {
    expect(buildDriveFilesQuery({ kind: "doc", parentIds: ["a"] })).toBe(
      `mimeType='${DOC_MIME}' and trashed=false and ('a' in parents)`,
    );
  });

  it("ORs several parents in parentheses", () => {
    expect(buildDriveFilesQuery({ parentIds: ["a", "b", "c"] })).toBe(
      `${ALL_KINDS} and trashed=false and ('a' in parents or 'b' in parents or 'c' in parents)`,
    );
  });

  it("escapes ' and \\ in parent ids", () => {
    const q = buildDriveFilesQuery({ parentIds: ["x' or trashed=true or 'y", "a\\b"] });
    expect(q).toBe(`${ALL_KINDS} and trashed=false and ('x\\' or trashed=true or \\'y' in parents or 'a\\\\b' in parents)`);
  });

  it("does not modify the input", () => {
    const parentIds = ["a", "b"];
    buildDriveFilesQuery({ parentIds });
    expect(parentIds).toEqual(["a", "b"]);
  });
});

describe("chunk", () => {
  it("splits into groups of size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns one group when shorter than size", () => {
    expect(chunk(["a"], 40)).toEqual([["a"]]);
  });

  it("returns an empty list for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("splits 81 parents into 40 / 40 / 1", () => {
    const ids = Array.from({ length: 81 }, (_, i) => `f${i}`);
    expect(chunk(ids, DRIVE_PARENTS_PER_QUERY).map((group) => group.length)).toEqual([40, 40, 1]);
  });

  it.each([[0], [-1], [1.5], [Number.NaN]])("throws for size %j", (size) => {
    expect(() => chunk([1, 2], size)).toThrow();
  });

  it("does not modify the input", () => {
    const items = [1, 2, 3];
    chunk(items, 2);
    expect(items).toEqual([1, 2, 3]);
  });
});

describe("buildFolderIndex", () => {
  it("maps space and project folders to their owners", () => {
    const index = buildFolderIndex(SPACES);
    expect(index.get("fs1")).toEqual({ spaceId: "s1", spaceName: "Học tập", projectId: null, projectName: null });
    expect(index.get("fp1")).toEqual({ spaceId: "s1", spaceName: "Học tập", projectId: "p1", projectName: "Luận văn" });
    expect(index.get("fp3")).toEqual({ spaceId: "s2", spaceName: "Công việc", projectId: "p3", projectName: "Bán lẻ" });
    expect(index.size).toBe(3);
  });

  it("skips null and blank folder ids", () => {
    const index = buildFolderIndex([{ id: "s", name: "S", driveFolderId: "  ", projects: [] }]);
    expect(index.size).toBe(0);
  });

  it("returns an empty map for no spaces", () => {
    expect(buildFolderIndex([]).size).toBe(0);
  });
});

describe("toDriveFileItem", () => {
  const index = buildFolderIndex(SPACES);

  it("maps a file in a space folder", () => {
    expect(toDriveFileItem(raw(), index)).toEqual({
      id: "f1",
      name: "Đề cương",
      kind: "doc",
      url: "https://docs.google.com/document/d/f1/edit",
      modifiedAt: "2026-11-27T08:00:00.000Z",
      spaceId: "s1",
      projectId: null,
      spaceName: "Học tập",
      projectName: null,
    });
  });

  it("maps a file in a project folder to both project and space", () => {
    const result = toDriveFileItem(raw({ parents: ["fp1"], mimeType: SHEET_MIME }), index);
    expect(result).toMatchObject({ kind: "sheet", spaceId: "s1", projectId: "p1", spaceName: "Học tập", projectName: "Luận văn" });
  });

  it("prefers the project folder over the space folder", () => {
    expect(toDriveFileItem(raw({ parents: ["fs1", "fp1"] }), index)).toMatchObject({ projectId: "p1" });
  });

  it("takes the first matching parent when several projects match", () => {
    expect(toDriveFileItem(raw({ parents: ["outside", "fp3", "fp1"] }), index)).toMatchObject({ projectId: "p3", spaceId: "s2" });
  });

  it.each([
    ["no id", { id: undefined }],
    ["null id", { id: null }],
    ["empty id", { id: "" }],
    ["unknown mime", { mimeType: "application/pdf" }],
    ["missing mime", { mimeType: null }],
    ["outside Taskeo", { parents: ["other"] }],
    ["no parents", { parents: null }],
    ["empty parents", { parents: [] }],
    ["missing modifiedTime", { modifiedTime: null }],
    ["empty modifiedTime", { modifiedTime: "" }],
  ])("returns null for %s", (_label, overrides) => {
    expect(toDriveFileItem(raw(overrides), index)).toBeNull();
  });

  it.each([
    ["javascript:alert(1)"],
    ["http://docs.google.com/document/d/f1"],
    ["https://evil.example.com/document"],
    [""],
    [null],
    [undefined],
  ])("sets url null for %j", (webViewLink) => {
    expect(toDriveFileItem(raw({ webViewLink }), index)?.url).toBeNull();
  });

  it.each([[undefined], [null], [""], ["   "]])("uses the fallback name for %j", (name) => {
    expect(toDriveFileItem(raw({ name }), index)?.name).toBe(DRIVE_FILE_UNNAMED);
  });

  it("does not modify the raw file", () => {
    const file = raw({ parents: ["fs1", "fp1"] });
    const copy = structuredClone(file);
    toDriveFileItem(file, index);
    expect(file).toEqual(copy);
  });
});

describe("mergeRecent", () => {
  it("sorts by modifiedAt desc and slices to limit", () => {
    const result = mergeRecent(
      [
        [item("a", "2026-11-01T00:00:00.000Z"), item("c", "2026-11-03T00:00:00.000Z")],
        [item("b", "2026-11-02T00:00:00.000Z")],
      ],
      2,
    );
    expect(result.map((file) => file.id)).toEqual(["c", "b"]);
  });

  it("removes duplicate ids across lists", () => {
    const a = item("a", "2026-11-01T00:00:00.000Z");
    const result = mergeRecent([[a], [{ ...a }], [item("b", "2026-11-02T00:00:00.000Z")]], 10);
    expect(result.map((file) => file.id)).toEqual(["b", "a"]);
  });

  it("returns an empty list for empty input or zero limit", () => {
    expect(mergeRecent([], 5)).toEqual([]);
    expect(mergeRecent([[], []], 5)).toEqual([]);
    expect(mergeRecent([[item("a", "2026-11-01T00:00:00.000Z")]], 0)).toEqual([]);
  });

  it("does not modify the input lists", () => {
    const list = [item("a", "2026-11-01T00:00:00.000Z"), item("b", "2026-11-02T00:00:00.000Z")];
    mergeRecent([list], 1);
    expect(list.map((file) => file.id)).toEqual(["a", "b"]);
  });
});

describe("toDriveFileName", () => {
  it("keeps a normal name", () => {
    expect(toDriveFileName("Biên bản họp")).toBe("Biên bản họp");
  });

  it("trims and collapses whitespace", () => {
    expect(toDriveFileName("  Kế   hoạch \t Q1  ")).toBe("Kế hoạch Q1");
  });

  it("replaces control and invisible characters", () => {
    expect(toDriveFileName("Báo\u0000cáo\n\u200Bnăm")).toBe("Báo cáo năm");
  });

  it("falls back to the default name when empty after cleaning", () => {
    expect(toDriveFileName("")).toBe(DEFAULT_DRIVE_FILE_NAME);
    expect(toDriveFileName("   ")).toBe(DEFAULT_DRIVE_FILE_NAME);
    expect(toDriveFileName("\u0000\u0007\u200B")).toBe(DEFAULT_DRIVE_FILE_NAME);
  });

  it("cuts long names to 200 code points", () => {
    expect(Array.from(toDriveFileName("😀".repeat(250)))).toHaveLength(200);
  });
});
