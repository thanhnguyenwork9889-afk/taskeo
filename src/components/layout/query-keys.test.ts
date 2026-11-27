import { describe, expect, it } from "vitest";
import { API_SPACES_QUERY_KEY, DRIVE_FILES_QUERY_KEY, apiProjectsQueryKey, driveFilesQueryKey } from "./query-keys";

describe("query keys", () => {
  it("DRIVE_FILES_QUERY_KEY là tiền tố của key danh sách file", () => {
    const params = { spaceId: "s1", limit: 5 };
    const key = driveFilesQueryKey(params);
    expect(key).toEqual(["drive-files", params]);
    expect(key.slice(0, DRIVE_FILES_QUERY_KEY.length)).toEqual([...DRIVE_FILES_QUERY_KEY]);
  });

  it("key không gian cố định, key dự án theo spaceId", () => {
    expect(API_SPACES_QUERY_KEY).toEqual(["api-spaces"]);
    expect(apiProjectsQueryKey("s1")).toEqual(["api-spaces", "s1", "projects"]);
    expect(apiProjectsQueryKey("s1").slice(0, 1)).toEqual([...API_SPACES_QUERY_KEY]);
  });
});
