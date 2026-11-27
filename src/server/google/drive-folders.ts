import "server-only";

// Chỉ import kiểu: bị xoá lúc compile, nên nạp module này không kéo theo `googleapis`.
import type { drive_v3 } from "googleapis";

import { APP_NAME } from "@/config/app";

import { DRIVE_FOLDER_MIME, rootFolderQuery } from "./drive-query";

/** appProperties Taskeo gắn lên thư mục Drive do app tạo. */
export type TaskeoAppProperties =
  | { taskeoRole: "root" }
  | { taskeoRole: "space"; taskeoSpaceId: string }
  | { taskeoRole: "project"; taskeoProjectId: string };

/**
 * Tuỳ chọn mỗi request. `signal` đi vào `MethodOptions` của googleapis (kế thừa `RequestInit`),
 * được gaxios 8 gộp với signal timeout của nó (`AbortSignal.any`) → huỷ request HTTP thật.
 */
export interface DriveRequestOptions {
  signal?: AbortSignal;
}

/**
 * Phần nhỏ nhất của client Drive v3 mà app dùng (dễ giả lập trong test). `about.get` chỉ dùng cho
 * dung lượng (`drive-storage.ts`), chạy được với scope `drive.file`. `files.get` dùng cho file đích
 * của lối tắt (`drive-shortcuts.ts`); với `drive.file` chỉ đọc được file app tạo hoặc user đã chọn
 * qua Google Picker.
 */
export interface DriveFilesClient {
  about: {
    get(
      params: drive_v3.Params$Resource$About$Get,
      options?: DriveRequestOptions,
    ): Promise<{ data: drive_v3.Schema$About }>;
  };
  files: {
    /** Đọc metadata một file (chỉ `fields` đã xin). Dùng khi kiểm file đích trước khi tạo lối tắt. */
    get(
      params: drive_v3.Params$Resource$Files$Get,
      options?: DriveRequestOptions,
    ): Promise<{ data: drive_v3.Schema$File }>;
    list(
      params: drive_v3.Params$Resource$Files$List,
      options?: DriveRequestOptions,
    ): Promise<{ data: drive_v3.Schema$FileList }>;
    create(
      params: drive_v3.Params$Resource$Files$Create,
      options?: DriveRequestOptions,
    ): Promise<{ data: drive_v3.Schema$File }>;
  };
}

/** Drive trả về thư mục vừa tạo mà không có `id`. */
export class DriveFolderMissingIdError extends Error {
  constructor() {
    super("Drive không trả id thư mục vừa tạo");
    this.name = "DriveFolderMissingIdError";
  }
}

/**
 * Tạo thư mục Drive, trả id. `name` phải đã chuẩn hoá (xem `toDriveFolderName`).
 * Không bắt lỗi: lỗi Google lan ra cho nơi gọi phân loại.
 * `signal` đã huỷ → ném `signal.reason`, không gọi Drive; đang chạy thì huỷ request.
 */
export async function createFolder(
  drive: DriveFilesClient,
  input: { name: string; parentId?: string; appProperties: TaskeoAppProperties },
  { signal }: DriveRequestOptions = {},
): Promise<string> {
  const { name, parentId, appProperties } = input;
  signal?.throwIfAborted();
  const res = await drive.files.create(
    {
      requestBody: {
        name,
        mimeType: DRIVE_FOLDER_MIME,
        appProperties,
        ...(parentId && { parents: [parentId] }),
      },
      fields: "id",
    },
    { signal },
  );
  const id = res.data.id;
  if (!id) throw new DriveFolderMissingIdError();
  return id;
}

/**
 * Trả id thư mục gốc "Taskeo" của app; chưa có thì tạo ở My Drive.
 * Lỡ có nhiều thư mục gốc thì dùng cái cũ nhất (`orderBy: createdTime`).
 * `signal` được chuyển cho cả `list` và `create`; đã huỷ thì ném trước mỗi lời gọi.
 */
export async function ensureRootFolder(
  drive: DriveFilesClient,
  { signal }: DriveRequestOptions = {},
): Promise<string> {
  signal?.throwIfAborted();
  const res = await drive.files.list(
    {
      q: rootFolderQuery(),
      spaces: "drive",
      fields: "files(id)",
      pageSize: 1,
      orderBy: "createdTime",
    },
    { signal },
  );
  const existing = res.data.files?.find((f) => f.id)?.id;
  if (existing) return existing;
  return createFolder(drive, { name: APP_NAME, appProperties: { taskeoRole: "root" } }, { signal });
}
