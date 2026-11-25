import { describe, expect, it } from "vitest";
import { DEFAULT_SPACE_ICON, SPACE_ICONS, SPACE_ICON_LABEL, SPACE_PALETTE, tintForColor } from "./labels";
import { createSeedState } from "./seed";
import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  SPACE_DESCRIPTION_MAX,
  SPACE_NAME_MAX,
  createProjectInputSchema,
  createSpaceInputSchema,
  projectDueDateSchema,
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
