import { describe, expect, it } from "vitest";
import {
  ACTIVITY_MESSAGE,
  ACTIVITY_TYPES,
  DEFAULT_SPACE_ICON,
  SPACE_ICONS, SPACE_ICON_LABEL, SPACE_PALETTE, tintForColor } from "./labels";
import { createSeedState } from "./seed";
import {
  ACTIVITY_LIST_DEFAULT,
  ACTIVITY_LIST_MAX,
  ID_MAX_LENGTH,
  FILE_LIST_DEFAULT,
  FILE_LIST_MAX,
  LIST_ACTIVITIES_QUERY_KEYS,
  LIST_FILES_QUERY_KEYS,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_DUE_YEAR_MAX,
  PROJECT_DUE_YEAR_MIN,
  PROJECT_NAME_MAX,
  SPACE_DESCRIPTION_MAX,
  SPACE_NAME_MAX,
  TASK_DESCRIPTION_MAX,
  TASK_TITLE_MAX,
  createProjectInputSchema,
  createSpaceInputSchema,
  createTaskInputSchema,
  activityTypeSchema,
  entityIdSchema,
  listActivitiesQuerySchema,
  listFilesQuerySchema,
  listTasksQuerySchema,
  projectDueDateSchema,
  queryToObject,
  updateTaskInputSchema,
  updateProjectInputSchema,
  spaceSchema,
  updateSpaceInputSchema,
  workspaceStateSchema,
} from "./validation";

const NOW = new Date(2026, 10, 23, 9, 0);

function stateWithSpaceIcons(icons: (unknown | undefined)[]) {
  const seed = createSeedState(NOW);
  const spaces = seed.spaces.map((space, i) => {
    const rest: Partial<typeof space> = { ...space };
    delete rest.icon;
    return icons[i] === undefined ? rest : { ...rest, icon: icons[i] };
  });
  return { ...seed, spaces };
}

describe("space icons", () => {
  it("starts with folder as the default icon and labels every icon", () => {
    expect(SPACE_ICONS[0]).toBe("folder");
    expect(DEFAULT_SPACE_ICON).toBe("folder");
    for (const icon of SPACE_ICONS) expect(SPACE_ICON_LABEL[icon].trim()).not.toBe("");
  });
});

describe("space palette", () => {
  it("gives every color a non-empty Vietnamese label", () => {
    for (const entry of SPACE_PALETTE) expect(entry.label.trim()).not.toBe("");
  });

  it("uses unique labels", () => {
    const labels = SPACE_PALETTE.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("space text limits", () => {
  const base = { name: "Gia đình" };

  it("accepts name and description at the exported maximum", () => {
    const input = { name: "a".repeat(SPACE_NAME_MAX), description: "b".repeat(SPACE_DESCRIPTION_MAX) };
    expect(createSpaceInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects name or description one character over the maximum", () => {
    expect(createSpaceInputSchema.safeParse({ name: "a".repeat(SPACE_NAME_MAX + 1) }).success).toBe(false);
    const longDescription = { ...base, description: "b".repeat(SPACE_DESCRIPTION_MAX + 1) };
    expect(createSpaceInputSchema.safeParse(longDescription).success).toBe(false);
  });
});

describe("tintForColor", () => {
  it("returns the palette tint for a palette color", () => {
    expect(tintForColor(SPACE_PALETTE[2].color)).toBe(SPACE_PALETTE[2].tint);
  });

  it("falls back to the first tint for unknown or empty colors", () => {
    expect(tintForColor("#000000")).toBe(SPACE_PALETTE[0].tint);
    expect(tintForColor("")).toBe(SPACE_PALETTE[0].tint);
  });
});

describe("storage space schema", () => {
  it("reads old state without icon and defaults it to folder", () => {
    const old = stateWithSpaceIcons([]);
    const result = workspaceStateSchema.safeParse(old);
    expect(result.success).toBe(true);
    expect(result.data?.spaces.every((s) => s.icon === "folder")).toBe(true);
    expect(old.spaces.every((s) => !("icon" in s))).toBe(true);
  });

  it("replaces an unknown icon with folder", () => {
    const space = { ...createSeedState(NOW).spaces[0], icon: "rocket-ship" };
    expect(spaceSchema.parse(space).icon).toBe("folder");
  });

  it("keeps a known icon", () => {
    const space = { ...createSeedState(NOW).spaces[0], icon: "book" };
    expect(spaceSchema.parse(space).icon).toBe("book");
  });
});

describe("createSpaceInputSchema", () => {
  const valid = { name: "  Gia đình  ", description: " Việc nhà ", color: SPACE_PALETTE[1].color, icon: "home" };

  it("accepts valid input and trims text", () => {
    expect(createSpaceInputSchema.parse(valid)).toEqual({
      name: "Gia đình",
      description: "Việc nhà",
      color: SPACE_PALETTE[1].color,
      icon: "home",
    });
  });

  it("accepts only a name without adding defaults", () => {
    expect(createSpaceInputSchema.parse({ name: "X" })).toEqual({ name: "X" });
  });

  it.each([
    ["empty name", { name: "" }],
    ["blank name", { name: "   " }],
    ["201-character name", { name: "a".repeat(201) }],
    ["501-character description", { name: "X", description: "a".repeat(501) }],
    ["color outside palette", { name: "X", color: "#000000" }],
    ["unknown icon", { name: "X", icon: "rocket-ship" }],
    ["extra key userId", { name: "X", userId: "u-1" }],
    ["missing name", {}],
  ])("rejects %s", (_label, input) => {
    expect(createSpaceInputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts boundary lengths", () => {
    expect(createSpaceInputSchema.safeParse({ name: "a".repeat(200), description: "a".repeat(500) }).success).toBe(true);
  });

  it("reports Vietnamese error for an empty name", () => {
    const result = createSpaceInputSchema.safeParse({ name: " " });
    expect(result.error?.issues[0]?.message).toBe("Tên không được để trống");
  });
});

describe("updateSpaceInputSchema", () => {
  it("rejects an empty object", () => {
    expect(updateSpaceInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects extra keys", () => {
    expect(updateSpaceInputSchema.safeParse({ name: "X", id: "sp-1" }).success).toBe(false);
    expect(updateSpaceInputSchema.safeParse({ order: 2 }).success).toBe(false);
  });

  it("parses only the fields that were sent", () => {
    const parsed = updateSpaceInputSchema.parse({ name: "x" });
    expect(parsed).toEqual({ name: "x" });
    expect("color" in parsed).toBe(false);
    expect("icon" in parsed).toBe(false);
  });

  it("validates each field like the create schema", () => {
    expect(updateSpaceInputSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(updateSpaceInputSchema.safeParse({ color: "#000000" }).success).toBe(false);
    expect(updateSpaceInputSchema.safeParse({ icon: "rocket-ship" }).success).toBe(false);
    expect(updateSpaceInputSchema.safeParse({ description: "" }).success).toBe(true);
  });
});

describe("projectDueDateSchema", () => {
  it.each(["2026-02-28", "2028-02-29", "2026-12-31"])("accepts real date %s", (value) => {
    expect(projectDueDateSchema.parse(value)).toBe(value);
  });

  it("accepts null", () => {
    expect(projectDueDateSchema.parse(null)).toBeNull();
  });

  it.each(["2026-02-31", "2027-02-29", "2026-13-01", "2026-00-10", "2026-1-5", "05/01/2026", "2026-01-01T00:00", "", "  "])(
    "rejects %j",
    (value) => {
      expect(projectDueDateSchema.safeParse(value).success).toBe(false);
    },
  );

  it("exports the year bounds", () => {
    expect(PROJECT_DUE_YEAR_MIN).toBe(1900);
    expect(PROJECT_DUE_YEAR_MAX).toBe(2100);
  });

  it.each(["1900-01-01", "2100-12-31"])("accepts boundary date %s", (value) => {
    expect(projectDueDateSchema.parse(value)).toBe(value);
  });

  it.each(["0000-01-01", "1899-12-31", "2101-01-01"])("rejects out-of-range year %s with a Vietnamese message", (value) => {
    const result = projectDueDateSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Ngày không hợp lệ");
  });
});

describe("createProjectInputSchema", () => {
  it("exports the text limits", () => {
    expect(PROJECT_NAME_MAX).toBe(200);
    expect(PROJECT_DESCRIPTION_MAX).toBe(500);
  });

  it("accepts full valid input and trims text", () => {
    const input = { name: "  Sửa nhà  ", description: " Tầng 2 ", status: "ON_HOLD", dueDate: "2026-12-01" };
    expect(createProjectInputSchema.parse(input)).toEqual({
      name: "Sửa nhà",
      description: "Tầng 2",
      status: "ON_HOLD",
      dueDate: "2026-12-01",
    });
  });

  it("accepts only a name without adding defaults", () => {
    expect(createProjectInputSchema.parse({ name: "X" })).toEqual({ name: "X" });
  });

  it("accepts dueDate null", () => {
    expect(createProjectInputSchema.parse({ name: "X", dueDate: null })).toEqual({ name: "X", dueDate: null });
  });

  it("accepts boundary lengths", () => {
    const input = { name: "a".repeat(PROJECT_NAME_MAX), description: "b".repeat(PROJECT_DESCRIPTION_MAX) };
    expect(createProjectInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ["empty name", { name: "" }],
    ["blank name", { name: "   " }],
    ["201-character name", { name: "a".repeat(201) }],
    ["501-character description", { name: "X", description: "a".repeat(501) }],
    ["unknown status", { name: "X", status: "PAUSED" }],
    ["lowercase status", { name: "X", status: "active" }],
    ["malformed dueDate", { name: "X", dueDate: "01/12/2026" }],
    ["impossible dueDate", { name: "X", dueDate: "2026-02-31" }],
    ["extra key spaceId", { name: "X", spaceId: "sp-1" }],
    ["extra key userId", { name: "X", userId: "u-1" }],
    ["extra key id", { name: "X", id: "p-1" }],
    ["extra key order", { name: "X", order: 1 }],
    ["extra key driveFolderId", { name: "X", driveFolderId: "f-1" }],
    ["missing name", {}],
  ])("rejects %s", (_label, input) => {
    expect(createProjectInputSchema.safeParse(input).success).toBe(false);
  });

  it("reports Vietnamese error for an empty name", () => {
    const result = createProjectInputSchema.safeParse({ name: " " });
    expect(result.error?.issues[0]?.message).toBe("Tên không được để trống");
  });
});

describe("updateProjectInputSchema", () => {
  it("rejects an empty object", () => {
    expect(updateProjectInputSchema.safeParse({}).success).toBe(false);
  });

  it.each([
    ["spaceId", { spaceId: "sp-2" }],
    ["userId", { name: "X", userId: "u-1" }],
    ["id", { name: "X", id: "p-1" }],
    ["order", { order: 2 }],
    ["driveFolderId", { driveFolderId: "f-1" }],
  ])("rejects extra key %s", (_label, input) => {
    expect(updateProjectInputSchema.safeParse(input).success).toBe(false);
  });

  it("parses only the fields that were sent", () => {
    const parsed = updateProjectInputSchema.parse({ name: "  x  " });
    expect(parsed).toEqual({ name: "x" });
    expect(Object.keys(parsed)).toEqual(["name"]);
  });

  it("accepts dueDate null alone", () => {
    expect(updateProjectInputSchema.parse({ dueDate: null })).toEqual({ dueDate: null });
  });

  it("validates each field like the create schema", () => {
    expect(updateProjectInputSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(updateProjectInputSchema.safeParse({ name: "a".repeat(201) }).success).toBe(false);
    expect(updateProjectInputSchema.safeParse({ description: "a".repeat(501) }).success).toBe(false);
    expect(updateProjectInputSchema.safeParse({ status: "PAUSED" }).success).toBe(false);
    expect(updateProjectInputSchema.safeParse({ dueDate: "2026-02-31" }).success).toBe(false);
    expect(updateProjectInputSchema.safeParse({ description: "" }).success).toBe(true);
    expect(updateProjectInputSchema.safeParse({ status: "DONE" }).success).toBe(true);
  });
});

describe("entityIdSchema", () => {
  it("exports the id length limit", () => {
    expect(ID_MAX_LENGTH).toBe(64);
  });

  it("accepts ids from 1 to ID_MAX_LENGTH characters", () => {
    expect(entityIdSchema.parse("p")).toBe("p");
    expect(entityIdSchema.parse("a".repeat(ID_MAX_LENGTH))).toBe("a".repeat(ID_MAX_LENGTH));
  });

  it.each([
    ["empty", ""],
    ["65 characters", "a".repeat(ID_MAX_LENGTH + 1)],
    ["number", 5],
    ["NUL character", "p\u0000x"],
  ])("rejects %s", (_label, value) => {
    expect(entityIdSchema.safeParse(value).success).toBe(false);
  });
});

const TASK_EXTRA_KEYS: [string, unknown][] = [
  ["userId", "u-1"],
  ["order", 1],
  ["completedAt", "2026-11-25T00:00:00.000Z"],
  ["calendarEventId", "ev-1"],
  ["addToCalendar", true],
  ["id", "t-1"],
  ["createdAt", "2026-11-25T00:00:00.000Z"],
  ["updatedAt", "2026-11-25T00:00:00.000Z"],
];

describe("createTaskInputSchema", () => {
  it("exports the text limits", () => {
    expect(TASK_TITLE_MAX).toBe(200);
    expect(TASK_DESCRIPTION_MAX).toBe(5000);
  });

  it("parses only a trimmed title without adding other fields", () => {
    const parsed = createTaskInputSchema.parse({ title: "  x " });
    expect(parsed).toEqual({ title: "x" });
    expect(Object.keys(parsed)).toEqual(["title"]);
  });

  it("accepts full valid input and trims text", () => {
    const input = {
      title: " Mua sơn ",
      description: " Màu trắng ",
      status: "IN_PROGRESS",
      priority: "URGENT",
      dueDate: "2026-12-01",
      spaceId: "sp-1",
      projectId: "p-1",
    };
    expect(createTaskInputSchema.parse(input)).toEqual({ ...input, title: "Mua sơn", description: "Màu trắng" });
  });

  it("accepts null for dueDate, spaceId and projectId", () => {
    const input = { title: "X", dueDate: null, spaceId: null, projectId: null };
    expect(createTaskInputSchema.parse(input)).toEqual(input);
  });

  it("accepts boundary lengths", () => {
    const input = {
      title: "a".repeat(TASK_TITLE_MAX),
      description: "b".repeat(TASK_DESCRIPTION_MAX),
      projectId: "c".repeat(ID_MAX_LENGTH),
    };
    expect(createTaskInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ["empty title", { title: "" }],
    ["blank title", { title: "   " }],
    ["201-character title", { title: "a".repeat(201) }],
    ["5001-character description", { title: "X", description: "a".repeat(5001) }],
    ["unknown status", { title: "X", status: "FOO" }],
    ["lowercase status", { title: "X", status: "done" }],
    ["unknown priority", { title: "X", priority: "CRITICAL" }],
    ["impossible dueDate", { title: "X", dueDate: "2026-02-31" }],
    ["out-of-range dueDate", { title: "X", dueDate: "1899-12-31" }],
    ["malformed dueDate", { title: "X", dueDate: "01/12/2026" }],
    ["65-character projectId", { title: "X", projectId: "a".repeat(65) }],
    ["65-character spaceId", { title: "X", spaceId: "a".repeat(65) }],
    ["empty projectId", { title: "X", projectId: "" }],
    ["missing title", {}],
  ])("rejects %s", (_label, input) => {
    expect(createTaskInputSchema.safeParse(input).success).toBe(false);
  });

  it.each(TASK_EXTRA_KEYS)("rejects extra key %s", (key, value) => {
    expect(createTaskInputSchema.safeParse({ title: "X", [key]: value }).success).toBe(false);
  });

  it("reports Vietnamese error for an empty title", () => {
    const result = createTaskInputSchema.safeParse({ title: " " });
    expect(result.error?.issues[0]?.message).toBe("Tiêu đề không được để trống");
  });
});

describe("updateTaskInputSchema", () => {
  it("rejects an empty object", () => {
    expect(updateTaskInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects spaceId", () => {
    expect(updateTaskInputSchema.safeParse({ spaceId: "sp-2" }).success).toBe(false);
    expect(updateTaskInputSchema.safeParse({ title: "X", spaceId: null }).success).toBe(false);
  });

  it.each(TASK_EXTRA_KEYS)("rejects extra key %s", (key, value) => {
    expect(updateTaskInputSchema.safeParse({ title: "X", [key]: value }).success).toBe(false);
  });

  it("parses only the fields that were sent", () => {
    const parsed = updateTaskInputSchema.parse({ title: "  x " });
    expect(parsed).toEqual({ title: "x" });
    expect(Object.keys(parsed)).toEqual(["title"]);
  });

  it.each([
    ["dueDate null", { dueDate: null }],
    ["projectId null", { projectId: null }],
    ["empty description", { description: "" }],
    ["status DONE", { status: "DONE" }],
    ["priority LOW", { priority: "LOW" }],
    ["projectId", { projectId: "p-2" }],
  ])("accepts %s alone", (_label, input) => {
    expect(updateTaskInputSchema.parse(input)).toEqual(input);
  });

  it.each([
    ["blank title", { title: "  " }],
    ["201-character title", { title: "a".repeat(201) }],
    ["5001-character description", { description: "a".repeat(5001) }],
    ["unknown status", { status: "FOO" }],
    ["unknown priority", { priority: "CRITICAL" }],
    ["impossible dueDate", { dueDate: "2026-02-31" }],
    ["out-of-range dueDate", { dueDate: "1899-12-31" }],
    ["65-character projectId", { projectId: "a".repeat(65) }],
  ])("rejects %s", (_label, input) => {
    expect(updateTaskInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("task text NUL characters", () => {
  const NUL_MESSAGE = "Không được chứa ký tự NUL";

  it.each([
    ["create title", createTaskInputSchema, { title: "a\u0000b" }],
    ["create description", createTaskInputSchema, { title: "X", description: "mô\u0000tả" }],
    ["update title", updateTaskInputSchema, { title: "a\u0000b" }],
    ["update description", updateTaskInputSchema, { description: "\u0000" }],
  ] as const)("rejects NUL in %s", (_label, schema, input) => {
    const result = schema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(NUL_MESSAGE);
  });

  it("still accepts normal text", () => {
    const input = { title: "Mua sơn", description: "Màu trắng\nhai lớp" };
    expect(createTaskInputSchema.parse(input)).toEqual(input);
    expect(updateTaskInputSchema.parse(input)).toEqual(input);
  });
});

describe("listTasksQuerySchema", () => {
  it("accepts all filters", () => {
    const query = { spaceId: "sp-1", projectId: "p-1", status: "DONE" };
    expect(listTasksQuerySchema.parse(query)).toEqual(query);
  });

  it("accepts no filters", () => {
    expect(listTasksQuerySchema.parse({})).toEqual({});
  });

  it("returns an object without undefined keys when no filters are sent", () => {
    const parsed = listTasksQuerySchema.parse({});
    expect(parsed).toStrictEqual({});
    expect(Object.keys(parsed)).toEqual([]);
  });

  // Zod 4: `z.preprocess` trả undefined vẫn giữ khoá → `{ spaceId: undefined }` (không phải `{}`).
  // Giá trị vẫn là undefined nên bộ lọc coi như không gửi; chỉ không strict-equal `{}`.
  it("treats an empty spaceId as undefined", () => {
    const parsed = listTasksQuerySchema.parse({ spaceId: "" });
    expect(parsed).toEqual({});
    expect(parsed.spaceId).toBeUndefined();
  });

  it("treats empty strings as not sent", () => {
    const parsed = listTasksQuerySchema.parse({ spaceId: "", projectId: "", status: "" });
    expect(parsed.spaceId).toBeUndefined();
    expect(parsed.projectId).toBeUndefined();
    expect(parsed.status).toBeUndefined();
  });

  it("ignores unknown keys", () => {
    expect(listTasksQuerySchema.parse({ status: "TODO", _: "123", cache: "x" })).toEqual({ status: "TODO" });
  });

  it.each([
    ["unknown status", { status: "FOO" }],
    ["lowercase status", { status: "todo" }],
    ["65-character spaceId", { spaceId: "a".repeat(65) }],
    ["65-character projectId", { projectId: "a".repeat(65) }],
  ])("rejects %s", (_label, query) => {
    expect(listTasksQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("queryToObject", () => {
  const KEYS = ["spaceId", "projectId", "status"] as const;

  it("builds an object from single values", () => {
    const params = new URLSearchParams("spaceId=sp-1&status=DONE");
    expect(queryToObject(params, KEYS)).toEqual({ ok: true, value: { spaceId: "sp-1", status: "DONE" } });
  });

  it("returns an empty object for an empty query", () => {
    expect(queryToObject(new URLSearchParams(""), KEYS)).toEqual({ ok: true, value: {} });
  });

  it("keeps an empty value so the schema can drop it", () => {
    expect(queryToObject(new URLSearchParams("spaceId="), KEYS)).toEqual({ ok: true, value: { spaceId: "" } });
  });

  it("ignores keys outside the list", () => {
    const params = new URLSearchParams("status=TODO&_=1&userId=u-2&userId=u-3");
    expect(queryToObject(params, KEYS)).toEqual({ ok: true, value: { status: "TODO" } });
  });

  it("reports the repeated key", () => {
    const params = new URLSearchParams("status=TODO&spaceId=a&spaceId=b");
    expect(queryToObject(params, KEYS)).toEqual({ ok: false, key: "spaceId" });
  });

  it("reports a key repeated with empty values", () => {
    expect(queryToObject(new URLSearchParams("status=&status="), KEYS)).toEqual({ ok: false, key: "status" });
  });

  it("does not modify the params", () => {
    const params = new URLSearchParams("status=TODO&spaceId=a");
    queryToObject(params, KEYS);
    expect(params.toString()).toBe("status=TODO&spaceId=a");
  });
});

describe("activity types", () => {
  it("has a non-empty Vietnamese message for every activity type", () => {
    expect(Object.keys(ACTIVITY_MESSAGE).sort()).toEqual([...ACTIVITY_TYPES].sort());
    expect(ACTIVITY_MESSAGE).toEqual({
      task_created: "Tạo công việc",
      task_done: "Hoàn thành công việc",
      task_updated: "Cập nhật công việc",
      project_created: "Tạo dự án",
      doc_created: "Tạo tài liệu",
    });
  });

  it("lists exactly the five activity types", () => {
    expect(ACTIVITY_TYPES).toEqual(["task_created", "task_done", "task_updated", "project_created", "doc_created"]);
  });

  it.each(ACTIVITY_TYPES.map((type) => [type]))("activityTypeSchema accepts %s", (type) => {
    expect(activityTypeSchema.parse(type)).toBe(type);
  });

  it.each([["task_deleted"], [""], ["TASK_DONE"], [" task_done"]])("activityTypeSchema rejects %j", (type) => {
    expect(activityTypeSchema.safeParse(type).success).toBe(false);
  });
});

describe("listActivitiesQuerySchema", () => {
  it("exposes the list limits and query keys", () => {
    expect(ACTIVITY_LIST_DEFAULT).toBe(50);
    expect(ACTIVITY_LIST_MAX).toBe(200);
    expect(LIST_ACTIVITIES_QUERY_KEYS).toEqual(["limit"]);
  });

  it("defaults limit to 50 when not sent", () => {
    expect(listActivitiesQuerySchema.parse({})).toEqual({ limit: ACTIVITY_LIST_DEFAULT });
  });

  it("defaults limit to 50 when empty", () => {
    expect(listActivitiesQuerySchema.parse({ limit: "" })).toEqual({ limit: ACTIVITY_LIST_DEFAULT });
  });

  it.each([
    ["1", 1],
    ["200", 200],
    ["050", 50],
    ["7", 7],
  ])("accepts limit %j as %d", (limit, expected) => {
    expect(listActivitiesQuerySchema.parse({ limit })).toEqual({ limit: expected });
  });

  it.each([["0"], ["201"], ["1.5"], ["-1"], ["1e2"], [" 5"], ["5 "], ["abc"], ["0x10"], ["+5"], ["99999999999999999999"]])(
    "rejects limit %j",
    (limit) => {
      expect(listActivitiesQuerySchema.safeParse({ limit }).success).toBe(false);
    },
  );

  it("ignores unknown keys", () => {
    expect(listActivitiesQuerySchema.parse({ limit: "10", _: "1" })).toEqual({ limit: 10 });
  });

  it("works with queryToObject output", () => {
    const result = queryToObject(new URLSearchParams("limit=25&x=1"), LIST_ACTIVITIES_QUERY_KEYS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(listActivitiesQuerySchema.parse(result.value)).toEqual({ limit: 25 });
  });

  it("does not modify the input", () => {
    const query = { limit: "10" };
    listActivitiesQuerySchema.parse(query);
    expect(query).toEqual({ limit: "10" });
  });
});

describe("listFilesQuerySchema", () => {
  it("exposes the list limits and query keys", () => {
    expect(FILE_LIST_DEFAULT).toBe(20);
    expect(FILE_LIST_MAX).toBe(100);
    expect(LIST_FILES_QUERY_KEYS).toEqual(["spaceId", "projectId", "kind", "limit"]);
  });

  it("defaults limit to 20 and leaves filters undefined", () => {
    expect(listFilesQuerySchema.parse({})).toEqual({ limit: FILE_LIST_DEFAULT });
  });

  it("treats empty values as not sent", () => {
    expect(listFilesQuerySchema.parse({ limit: "", kind: "", spaceId: "", projectId: "" })).toEqual({
      limit: FILE_LIST_DEFAULT,
    });
  });

  it.each([
    ["1", 1],
    ["100", 100],
    ["020", 20],
  ])("accepts limit %j as %d", (limit, expected) => {
    expect(listFilesQuerySchema.parse({ limit }).limit).toBe(expected);
  });

  it.each([["0"], ["101"], ["1.5"], ["-1"], ["1e2"], [" 5"], ["abc"], ["0x10"], ["+5"]])("rejects limit %j", (limit) => {
    expect(listFilesQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it.each([["doc"], ["sheet"], ["slide"]])("accepts kind %j", (kind) => {
    expect(listFilesQuerySchema.parse({ kind })).toEqual({ limit: FILE_LIST_DEFAULT, kind });
  });

  it.each([["pdf"], ["DOC"], [" doc"]])("rejects kind %j", (kind) => {
    expect(listFilesQuerySchema.safeParse({ kind }).success).toBe(false);
  });

  it("accepts spaceId or projectId alone", () => {
    expect(listFilesQuerySchema.parse({ spaceId: "s1" })).toEqual({ limit: FILE_LIST_DEFAULT, spaceId: "s1" });
    expect(listFilesQuerySchema.parse({ projectId: "p1", kind: "doc", limit: "5" })).toEqual({
      limit: 5,
      projectId: "p1",
      kind: "doc",
    });
  });

  it("rejects spaceId and projectId together", () => {
    expect(listFilesQuerySchema.safeParse({ spaceId: "s1", projectId: "p1" }).success).toBe(false);
  });

  it("rejects ids that are too long or contain NUL", () => {
    expect(listFilesQuerySchema.safeParse({ spaceId: "x".repeat(65) }).success).toBe(false);
    expect(listFilesQuerySchema.safeParse({ projectId: "a\u0000b" }).success).toBe(false);
  });

  it("ignores unknown keys", () => {
    expect(listFilesQuerySchema.parse({ limit: "10", _: "1" })).toEqual({ limit: 10 });
  });

  it("works with queryToObject output and flags repeated keys", () => {
    const result = queryToObject(new URLSearchParams("kind=sheet&limit=4&x=1"), LIST_FILES_QUERY_KEYS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(listFilesQuerySchema.parse(result.value)).toEqual({ kind: "sheet", limit: 4 });
    expect(queryToObject(new URLSearchParams("kind=doc&kind=sheet"), LIST_FILES_QUERY_KEYS)).toEqual({
      ok: false,
      key: "kind",
    });
  });

  it("does not modify the input", () => {
    const query = { limit: "10", spaceId: "s1" };
    listFilesQuerySchema.parse(query);
    expect(query).toEqual({ limit: "10", spaceId: "s1" });
  });
});
