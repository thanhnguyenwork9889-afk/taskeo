import { describe, expect, it } from "vitest";
import { DEFAULT_SPACE_ICON, SPACE_PALETTE } from "./labels";
import { spaceFromRecord, type SpaceRecord } from "./space-record";
import { spaceSchema } from "./validation";

const FULL_RECORD: SpaceRecord = {
  id: "sp_1",
  name: "Học tập",
  description: "Ôn thi cuối kỳ",
  color: SPACE_PALETTE[1].color,
  icon: "book",
  driveFolderId: "drive_1",
};

describe("spaceFromRecord", () => {
  it("maps every field and computes tint from color", () => {
    expect(spaceFromRecord(FULL_RECORD)).toEqual({
      id: "sp_1",
      name: "Học tập",
      description: "Ôn thi cuối kỳ",
      color: SPACE_PALETTE[1].color,
      tint: SPACE_PALETTE[1].tint,
      icon: "book",
      driveFolderId: "drive_1",
    });
  });

  it("falls back to defaults when nullable fields are null", () => {
    const space = spaceFromRecord({ ...FULL_RECORD, description: null, color: null, icon: null, driveFolderId: null });
    expect(space.description).toBe("");
    expect(space.color).toBe(SPACE_PALETTE[0].color);
    expect(space.tint).toBe(SPACE_PALETTE[0].tint);
    expect(space.icon).toBe(DEFAULT_SPACE_ICON);
    expect(space.driveFolderId).toBeNull();
  });

  it("falls back to the first palette color when color is outside the palette", () => {
    for (const color of ["#000000", "", "   ", "red"]) {
      const space = spaceFromRecord({ ...FULL_RECORD, color });
      expect(space.color).toBe(SPACE_PALETTE[0].color);
      expect(space.tint).toBe(SPACE_PALETTE[0].tint);
    }
  });

  it("falls back to the default icon when icon is unknown", () => {
    for (const icon of ["rocket", "", "   ", "FOLDER"]) {
      expect(spaceFromRecord({ ...FULL_RECORD, icon }).icon).toBe(DEFAULT_SPACE_ICON);
    }
  });

  it("keeps an empty description as is", () => {
    expect(spaceFromRecord({ ...FULL_RECORD, description: "" }).description).toBe("");
  });

  it("drops extra record fields such as userId, order and createdAt", () => {
    const record = { ...FULL_RECORD, userId: "user_1", order: 3, createdAt: new Date(2026, 10, 23) };
    const space = spaceFromRecord(record);
    expect(Object.keys(space).sort()).toEqual(["color", "description", "driveFolderId", "icon", "id", "name", "tint"]);
    expect(space).not.toHaveProperty("userId");
    expect(space).not.toHaveProperty("order");
    expect(space).not.toHaveProperty("createdAt");
  });

  it("does not mutate the input record", () => {
    const record = { ...FULL_RECORD, color: null, icon: "rocket" };
    const snapshot = structuredClone(record);
    spaceFromRecord(record);
    expect(record).toEqual(snapshot);
  });

  it("produces a value accepted by spaceSchema", () => {
    const records: SpaceRecord[] = [FULL_RECORD, { ...FULL_RECORD, description: null, color: "#123456", icon: "rocket", driveFolderId: null }];
    for (const record of records) {
      const parsed = spaceSchema.safeParse(spaceFromRecord(record));
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(spaceFromRecord(record));
    }
  });
});
