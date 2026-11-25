import { describe, expect, it } from "vitest";
import { SPACE_ICONS } from "@/domain/labels";
import { SPACE_ICON_COMPONENT } from "./space-icons";

describe("SPACE_ICON_COMPONENT", () => {
  it("có component cho mọi id trong SPACE_ICONS", () => {
    for (const icon of SPACE_ICONS) {
      expect(SPACE_ICON_COMPONENT[icon]).toBeDefined();
    }
  });

  it("không có id thừa ngoài SPACE_ICONS", () => {
    expect(Object.keys(SPACE_ICON_COMPONENT).sort()).toEqual([...SPACE_ICONS].sort());
  });

  it("mỗi id ánh xạ tới một icon riêng", () => {
    const components = new Set(Object.values(SPACE_ICON_COMPONENT));
    expect(components.size).toBe(SPACE_ICONS.length);
  });
});
