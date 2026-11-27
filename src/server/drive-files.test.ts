import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDriveFilesQuery, DOC_KIND_MIME, DRIVE_PARENTS_PER_QUERY, type RawDriveFile } from "@/domain/drive-files";
import { FILE_LIST_MAX } from "@/domain/validation";

const db = vi.hoisted(() => ({
  space: { findMany: vi.fn(), findFirst: vi.fn() },
  project: { findFirst: vi.fn() },
}));

vi.mock("@/server/db", () => ({ prisma: db }));

const listDriveFiles = vi.hoisted(() => vi.fn());

vi.mock("@/server/google/drive-files", () => ({ listDriveFiles }));
vi.mock("@/server/google/drive-provision", () => ({
  provisionSpaceFolder: vi.fn(),
  provisionProjectFolder: vi.fn(),
}));

import { listFiles } from "./drive-files";

const USER = "user-1";
const { space, project } = db;

interface ProjectRow {
  id: string;
  name: string;
  driveFolderId: string | null;
}

interface SpaceRow extends ProjectRow {
  projects: ProjectRow[];
}

const SPACES: SpaceRow[] = [
  {
    id: "s1",
    name: "Công việc",
    driveFolderId: "f-s1",
    projects: [
      { id: "p1", name: "Website", driveFolderId: "f-p1" },
      { id: "p2", name: "Chưa có thư mục", driveFolderId: null },
    ],
  },
  { id: "s2", name: "Cá nhân", driveFolderId: "f-s2", projects: [] },
  { id: "s3", name: "Không thư mục", driveFolderId: null, projects: [{ id: "p3", name: "Trống", driveFolderId: null }] },
];

function raw(id: string, parent: string, modifiedTime: string, overrides: Partial<RawDriveFile> = {}): RawDriveFile {
  return {
    id,
    name: `File ${id}`,
    mimeType: DOC_KIND_MIME.doc,
    modifiedTime,
    webViewLink: `https://docs.google.com/document/d/${id}/edit`,
    parents: [parent],
    ...overrides,
  };
}

/** Dữ liệu DB giả của user; các mock Prisma bên dưới đọc từ đây. */
let fixture: SpaceRow[] = SPACES;

beforeEach(() => {
  vi.resetAllMocks();
  fixture = SPACES;
  space.findMany.mockImplementation(async () => fixture);
  space.findFirst.mockImplementation(
    async ({ where }: { where: { id: string } }) => fixture.find((row) => row.id === where.id) ?? null,
  );
  project.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
    for (const row of fixture) {
      const found = row.projects.find((item) => item.id === where.id);
      if (found) return { ...found, space: { id: row.id, name: row.name } };
    }
    return null;
  });
  listDriveFiles.mockResolvedValue({ status: "ok", files: [] });
});

const PROJECT_SELECT = { id: true, name: true, driveFolderId: true };
const SCOPED_PROJECTS = { where: { userId: USER }, take: expect.any(Number), select: PROJECT_SELECT };

describe("listFiles — truy vấn DB", () => {
  it("không lọc: một truy vấn không gian + dự án lọc theo userId, có take", async () => {
    await listFiles(USER, { limit: 20 });

    expect(space.findMany).toHaveBeenCalledTimes(1);
    expect(space.findFirst).not.toHaveBeenCalled();
    expect(project.findFirst).not.toHaveBeenCalled();
    const args = space.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: USER });
    expect(args.take).toBeGreaterThan(0);
    expect(args.select).toEqual({
      id: true,
      name: true,
      driveFolderId: true,
      projects: SCOPED_PROJECTS,
    });
  });

  it("lọc spaceId: chỉ một space.findFirst theo id + userId, không nạp mọi không gian", async () => {
    await listFiles(USER, { spaceId: "s1", limit: 20 });

    expect(space.findMany).not.toHaveBeenCalled();
    expect(project.findFirst).not.toHaveBeenCalled();
    expect(space.findFirst).toHaveBeenCalledTimes(1);
    expect(space.findFirst).toHaveBeenCalledWith({
      where: { id: "s1", userId: USER },
      select: { ...PROJECT_SELECT, projects: SCOPED_PROJECTS },
    });
  });

  it("lọc projectId: chỉ một project.findFirst theo id + userId (cả không gian), không nạp không gian", async () => {
    await listFiles(USER, { projectId: "p1", limit: 20 });

    expect(space.findMany).not.toHaveBeenCalled();
    expect(space.findFirst).not.toHaveBeenCalled();
    expect(project.findFirst).toHaveBeenCalledTimes(1);
    expect(project.findFirst).toHaveBeenCalledWith({
      where: { id: "p1", userId: USER, space: { userId: USER } },
      select: { ...PROJECT_SELECT, space: { select: { id: true, name: true } } },
    });
  });

  it("có cả projectId và spaceId: projectId được ưu tiên như trước", async () => {
    await listFiles(USER, { projectId: "p1", spaceId: "s2", limit: 5 });

    expect(space.findFirst).not.toHaveBeenCalled();
    expect(listDriveFiles).toHaveBeenCalledWith(USER, [buildDriveFilesQuery({ parentIds: ["f-p1"] })], 5);
  });
});

describe("listFiles — không lọc (gần đây)", () => {
  it("một q không có parents, pageSize = FILE_LIST_MAX", async () => {
    await listFiles(USER, { limit: 4 });

    expect(listDriveFiles).toHaveBeenCalledTimes(1);
    expect(listDriveFiles).toHaveBeenCalledWith(USER, [buildDriveFilesQuery({})], FILE_LIST_MAX);
    expect(listDriveFiles.mock.calls[0][1][0]).not.toContain("in parents");
  });

  it("chỉ giữ file trong thư mục của user, mới nhất trước, cắt theo limit", async () => {
    listDriveFiles.mockResolvedValue({
      status: "ok",
      files: [
        raw("a", "f-s1", "2026-11-20T00:00:00.000Z"),
        raw("outside", "f-other", "2026-11-27T00:00:00.000Z"),
        raw("b", "f-p1", "2026-11-26T00:00:00.000Z"),
        raw("c", "f-s2", "2026-11-25T00:00:00.000Z"),
        raw("d", "f-s2", "2026-11-01T00:00:00.000Z"),
      ],
    });

    const result = await listFiles(USER, { limit: 3 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.map((file) => file.id)).toEqual(["b", "c", "a"]);
    expect(result.files[0]).toEqual({
      id: "b",
      name: "File b",
      kind: "doc",
      url: "https://docs.google.com/document/d/b/edit",
      modifiedAt: "2026-11-26T00:00:00.000Z",
      spaceId: "s1",
      spaceName: "Công việc",
      projectId: "p1",
      projectName: "Website",
    });
  });

  it("user chưa có thư mục nào → [] và không gọi Drive", async () => {
    fixture = [SPACES[2]];

    await expect(listFiles(USER, { limit: 20 })).resolves.toEqual({ ok: true, files: [] });
    expect(listDriveFiles).not.toHaveBeenCalled();
  });

  it("user chưa có không gian nào → [] và không gọi Drive", async () => {
    fixture = [];

    await expect(listFiles(USER, { limit: 20 })).resolves.toEqual({ ok: true, files: [] });
    expect(listDriveFiles).not.toHaveBeenCalled();
  });

  it("truyền kind vào q", async () => {
    await listFiles(USER, { kind: "sheet", limit: 20 });

    const [q] = listDriveFiles.mock.calls[0][1];
    expect(q).toBe(buildDriveFilesQuery({ kind: "sheet" }));
    expect(q).toContain(DOC_KIND_MIME.sheet);
    expect(q).not.toContain(DOC_KIND_MIME.doc);
  });
});

describe("listFiles — lọc spaceId", () => {
  it("q gồm thư mục không gian và thư mục dự án con, pageSize = limit", async () => {
    await listFiles(USER, { spaceId: "s1", kind: "slide", limit: 7 });

    expect(listDriveFiles).toHaveBeenCalledWith(
      USER,
      [buildDriveFilesQuery({ kind: "slide", parentIds: ["f-s1", "f-p1"] })],
      7,
    );
  });

  it("chỉ trả file trong phạm vi không gian (bỏ file của không gian khác)", async () => {
    listDriveFiles.mockResolvedValue({
      status: "ok",
      files: [
        raw("x", "f-s2", "2026-11-27T00:00:00.000Z"),
        raw("a", "f-s1", "2026-11-20T00:00:00.000Z"),
        raw("b", "f-p1", "2026-11-26T00:00:00.000Z"),
      ],
    });

    const result = await listFiles(USER, { spaceId: "s1", limit: 20 });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.files.map((file) => [file.id, file.projectId])).toEqual([
      ["b", "p1"],
      ["a", null],
    ]);
  });

  it("chia khối khi hơn DRIVE_PARENTS_PER_QUERY thư mục và gộp, khử trùng kết quả", async () => {
    const projects = Array.from({ length: 45 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, driveFolderId: `f-p${i}` }));
    fixture = [{ id: "big", name: "Lớn", driveFolderId: "f-big", projects }];
    listDriveFiles.mockResolvedValue({
      status: "ok",
      files: [
        raw("a", "f-p1", "2026-11-20T00:00:00.000Z"),
        raw("b", "f-p44", "2026-11-26T00:00:00.000Z"),
        raw("a", "f-p1", "2026-11-20T00:00:00.000Z"),
      ],
    });

    const result = await listFiles(USER, { spaceId: "big", limit: 10 });

    const folders = ["f-big", ...projects.map((project) => project.driveFolderId)];
    expect(listDriveFiles).toHaveBeenCalledTimes(1);
    expect(listDriveFiles).toHaveBeenCalledWith(
      USER,
      [
        buildDriveFilesQuery({ parentIds: folders.slice(0, DRIVE_PARENTS_PER_QUERY) }),
        buildDriveFilesQuery({ parentIds: folders.slice(DRIVE_PARENTS_PER_QUERY) }),
      ],
      10,
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.files.map((file) => file.id)).toEqual(["b", "a"]);
  });

  it("không gian không có thư mục nào → [] và không gọi Drive", async () => {
    await expect(listFiles(USER, { spaceId: "s3", limit: 20 })).resolves.toEqual({ ok: true, files: [] });
    expect(listDriveFiles).not.toHaveBeenCalled();
  });

  it("không gian của user khác → not_found, không gọi Drive", async () => {
    await expect(listFiles(USER, { spaceId: "s-other", limit: 20 })).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(listDriveFiles).not.toHaveBeenCalled();
  });
});

describe("listFiles — lọc projectId", () => {
  it("q chỉ gồm thư mục dự án, pageSize = limit", async () => {
    await listFiles(USER, { projectId: "p1", kind: "doc", limit: 5 });

    expect(listDriveFiles).toHaveBeenCalledWith(USER, [buildDriveFilesQuery({ kind: "doc", parentIds: ["f-p1"] })], 5);
  });

  it("file nằm thẳng trong thư mục không gian không lọt vào kết quả của dự án", async () => {
    listDriveFiles.mockResolvedValue({
      status: "ok",
      files: [raw("s", "f-s1", "2026-11-27T00:00:00.000Z"), raw("p", "f-p1", "2026-11-26T00:00:00.000Z")],
    });

    const result = await listFiles(USER, { projectId: "p1", limit: 20 });

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.files.map((file) => file.id)).toEqual(["p"]);
      expect(result.files[0]).toMatchObject({ spaceId: "s1", projectId: "p1", projectName: "Website" });
    }
  });

  it("dự án chưa có driveFolderId → [] và không gọi Drive", async () => {
    await expect(listFiles(USER, { projectId: "p2", limit: 20 })).resolves.toEqual({ ok: true, files: [] });
    expect(listDriveFiles).not.toHaveBeenCalled();
  });

  it("dự án của user khác → not_found, không gọi Drive", async () => {
    await expect(listFiles(USER, { projectId: "p-other", limit: 20 })).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(listDriveFiles).not.toHaveBeenCalled();
  });
});

describe("listFiles — kết quả Drive", () => {
  it("not_connected → drive_not_connected", async () => {
    listDriveFiles.mockResolvedValue({ status: "not_connected" });

    await expect(listFiles(USER, { limit: 20 })).resolves.toEqual({ ok: false, reason: "drive_not_connected" });
  });

  it("error → drive_error", async () => {
    listDriveFiles.mockResolvedValue({ status: "error" });

    await expect(listFiles(USER, { spaceId: "s1", limit: 20 })).resolves.toEqual({ ok: false, reason: "drive_error" });
  });

  it("dùng deps truyền vào thay cho listDriveFiles mặc định", async () => {
    const custom = vi.fn().mockResolvedValue({ status: "ok", files: [raw("a", "f-s2", "2026-11-20T00:00:00.000Z")] });

    const result = await listFiles(USER, { spaceId: "s2", limit: 20 }, { listDriveFiles: custom });

    expect(custom).toHaveBeenCalledTimes(1);
    expect(listDriveFiles).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, files: [{ id: "a", spaceId: "s2", projectId: null }] });
  });
});
