import type { drive_v3 } from "googleapis";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { APP_NAME } from "@/config/app";

import {
  createFolder,
  DriveFolderMissingIdError,
  ensureRootFolder,
  type DriveFilesClient,
} from "./drive-folders";
import { DRIVE_FOLDER_MIME, rootFolderQuery } from "./drive-query";

function fakeDrive() {
  const list = vi.fn();
  const create = vi.fn();
  const drive = { files: { list, create } } as unknown as DriveFilesClient;
  return { drive, list, create };
}

describe("DriveFilesClient", () => {
  it("drive_v3.Drive gán được cho DriveFilesClient (kiểm tra lúc compile)", () => {
    expectTypeOf<drive_v3.Drive>().toExtend<DriveFilesClient>();
  });
});

describe("ensureRootFolder", () => {
  it("tìm thấy thư mục gốc → trả id, không tạo mới, tham số list đúng", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files: [{ id: "root-1" }] } });

    await expect(ensureRootFolder(drive)).resolves.toBe("root-1");

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({
      q: rootFolderQuery(),
      spaces: "drive",
      fields: "files(id)",
      pageSize: 1,
      orderBy: "createdTime",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["files rỗng", { files: [] }],
    ["không có files", {}],
    ["file không có id", { files: [{}, { id: "" }, { id: null }] }],
  ])("%s → tạo thư mục gốc APP_NAME, không parents", async (_label, data) => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data });
    create.mockResolvedValue({ data: { id: "new-root" } });

    await expect(ensureRootFolder(drive)).resolves.toBe("new-root");

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      requestBody: {
        name: APP_NAME,
        mimeType: DRIVE_FOLDER_MIME,
        appProperties: { taskeoRole: "root" },
      },
      fields: "id",
    });
    expect(create.mock.calls[0][0].requestBody).not.toHaveProperty("parents");
  });

  it("list bị từ chối → lỗi lan ra, không tạo", async () => {
    const { drive, list, create } = fakeDrive();
    const err = new Error("boom");
    list.mockRejectedValue(err);

    await expect(ensureRootFolder(drive)).rejects.toBe(err);
    expect(create).not.toHaveBeenCalled();
  });

  it("tạo gốc mà id rỗng → DriveFolderMissingIdError", async () => {
    const { drive, list, create } = fakeDrive();
    list.mockResolvedValue({ data: { files: [] } });
    create.mockResolvedValue({ data: {} });

    await expect(ensureRootFolder(drive)).rejects.toBeInstanceOf(DriveFolderMissingIdError);
  });
});

describe("createFolder", () => {
  it("thư mục không gian: gửi parents, appProperties, mimeType, fields id", async () => {
    const { drive, create } = fakeDrive();
    create.mockResolvedValue({ data: { id: "space-folder" } });

    await expect(
      createFolder(drive, {
        name: "Không gian A",
        parentId: "root-1",
        appProperties: { taskeoRole: "space", taskeoSpaceId: "sp_1" },
      }),
    ).resolves.toBe("space-folder");

    expect(create).toHaveBeenCalledWith({
      requestBody: {
        name: "Không gian A",
        mimeType: DRIVE_FOLDER_MIME,
        appProperties: { taskeoRole: "space", taskeoSpaceId: "sp_1" },
        parents: ["root-1"],
      },
      fields: "id",
    });
  });

  it("thư mục dự án: parents là thư mục không gian", async () => {
    const { drive, create } = fakeDrive();
    create.mockResolvedValue({ data: { id: "project-folder" } });

    await createFolder(drive, {
      name: "Dự án B",
      parentId: "space-folder",
      appProperties: { taskeoRole: "project", taskeoProjectId: "pr_1" },
    });

    expect(create.mock.calls[0][0]).toEqual({
      requestBody: {
        name: "Dự án B",
        mimeType: DRIVE_FOLDER_MIME,
        appProperties: { taskeoRole: "project", taskeoProjectId: "pr_1" },
        parents: ["space-folder"],
      },
      fields: "id",
    });
  });

  it("không truyền tên đã chuẩn hoá lại (giữ nguyên tên)", async () => {
    const { drive, create } = fakeDrive();
    create.mockResolvedValue({ data: { id: "x" } });
    await createFolder(drive, { name: "  a/b  ", appProperties: { taskeoRole: "root" } });
    expect(create.mock.calls[0][0].requestBody.name).toBe("  a/b  ");
    expect(create.mock.calls[0][0].requestBody).not.toHaveProperty("parents");
  });

  it.each([
    ["id rỗng", { id: "" }],
    ["không có id", {}],
    ["id null", { id: null }],
  ])("%s → DriveFolderMissingIdError", async (_label, data) => {
    const { drive, create } = fakeDrive();
    create.mockResolvedValue({ data });

    const p = createFolder(drive, { name: "X", appProperties: { taskeoRole: "root" } });
    await expect(p).rejects.toBeInstanceOf(DriveFolderMissingIdError);
    await expect(p).rejects.toMatchObject({ name: "DriveFolderMissingIdError" });
  });

  it("create bị từ chối → lỗi lan ra nguyên vẹn", async () => {
    const { drive, create } = fakeDrive();
    const err = new Error("403");
    create.mockRejectedValue(err);
    await expect(
      createFolder(drive, { name: "X", parentId: "p", appProperties: { taskeoRole: "root" } }),
    ).rejects.toBe(err);
  });
});
