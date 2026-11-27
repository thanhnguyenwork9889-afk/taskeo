"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDriveStorage, shouldRetryDriveStorage } from "./drive-storage-api";
import { driveStorageViewState } from "./drive-storage-state";
import { useViewer } from "./ui-context";

const STALE_TIME_MS = 5 * 60_000;

/**
 * Dung lượng Google Drive qua `GET /api/drive/storage` cho sidebar. Chỉ gọi API khi configured
 * + đã kết nối Drive. Dùng `useViewer()` nên phải nằm trong `<Suspense>`.
 */
export function useDriveStorage() {
  const { isDemo, driveConnected } = useViewer();
  const result = useQuery({
    queryKey: ["drive-storage"],
    queryFn: ({ signal }) => fetchDriveStorage(signal),
    retry: shouldRetryDriveStorage,
    staleTime: STALE_TIME_MS,
    enabled: !isDemo && driveConnected,
  });
  const state = driveStorageViewState({
    isDemo,
    driveConnected,
    status: result.status,
    error: result.error,
    hasData: result.data !== undefined,
  });
  return { state, storage: result.data ?? null, retry: () => void result.refetch(), retrying: result.isFetching };
}
