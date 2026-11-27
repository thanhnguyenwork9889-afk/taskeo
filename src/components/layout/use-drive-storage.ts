"use client";

import { useQuery } from "@tanstack/react-query";
import { driveStorageQueryOptions } from "./drive-storage-query";
import { driveStorageViewState } from "./drive-storage-state";
import { useViewer } from "./ui-context";

/**
 * Dung lượng Google Drive qua `GET /api/drive/storage` cho sidebar. Chỉ gọi API khi configured
 * + đã kết nối Drive (xem `driveStorageQueryOptions`). Dùng `useViewer()` nên phải nằm trong `<Suspense>`.
 */
export function useDriveStorage() {
  const { isDemo, driveConnected } = useViewer();
  const result = useQuery(driveStorageQueryOptions({ isDemo, driveConnected }));
  const state = driveStorageViewState({
    isDemo,
    driveConnected,
    status: result.status,
    error: result.error,
    hasData: result.data !== undefined,
  });
  return { state, storage: result.data ?? null, retry: () => void result.refetch(), retrying: result.isFetching };
}
