"use client";

import { useQuery } from "@tanstack/react-query";
import { matchesQuery, useViewer } from "@/components/layout/ui-context";
import { fetchDriveFiles, shouldRetryDriveFiles, type DriveFilesParams } from "./drive-files-api";
import { driveFilesViewState } from "./drive-files-state";

/** File Drive thật qua `GET /api/files`. Chế độ demo / chưa kết nối Drive → truyền `enabled: false`. */
export function useDriveFiles(params: DriveFilesParams, { enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: ["drive-files", params],
    queryFn: ({ signal }) => fetchDriveFiles(params, signal),
    retry: shouldRetryDriveFiles,
    enabled,
  });
}

/**
 * Danh sách file Drive cho một màn hình: gọi API (chỉ khi configured + đã kết nối Drive),
 * lọc theo ô tìm kiếm, và chọn trạng thái hiển thị. Dùng `useViewer()` nên phải nằm trong `<Suspense>`.
 */
export function useDriveFileList(params: DriveFilesParams, query: string) {
  const { isDemo, driveConnected } = useViewer();
  const result = useDriveFiles(params, { enabled: !isDemo && driveConnected });
  const files = (result.data ?? []).filter((file) => matchesQuery(query, file.name));
  const state = driveFilesViewState({ isDemo, driveConnected, status: result.status, error: result.error, count: files.length });
  return { state, files, retry: () => void result.refetch(), retrying: result.isFetching };
}
