"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDriveFiles, shouldRetryDriveFiles, type DriveFilesParams } from "./drive-files-api";

/** File Drive thật qua `GET /api/files`. Chế độ demo / chưa kết nối Drive → truyền `enabled: false`. */
export function useDriveFiles(params: DriveFilesParams, { enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: ["drive-files", params],
    queryFn: ({ signal }) => fetchDriveFiles(params, signal),
    retry: shouldRetryDriveFiles,
    enabled,
  });
}
