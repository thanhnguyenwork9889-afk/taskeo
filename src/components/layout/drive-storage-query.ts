import type { DriveStorage } from "@/domain/types";
import { fetchDriveStorage, shouldRetryDriveStorage } from "./drive-storage-api";

// Tuỳ chọn TanStack Query cho dung lượng Drive (T016). Tách khỏi hook để test được
// "demo / chưa kết nối thì không gọi API" mà không cần React.

export const DRIVE_STORAGE_QUERY_KEY = ["drive-storage"] as const;
export const DRIVE_STORAGE_STALE_TIME_MS = 5 * 60_000;

export interface DriveStorageQueryInput {
  isDemo: boolean;
  driveConnected: boolean;
}

/** Chỉ bật (`enabled`) khi configured + đã kết nối Drive; server đã trả lời thì không retry. */
export function driveStorageQueryOptions({ isDemo, driveConnected }: DriveStorageQueryInput) {
  return {
    queryKey: DRIVE_STORAGE_QUERY_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<DriveStorage> => fetchDriveStorage(signal),
    retry: shouldRetryDriveStorage,
    staleTime: DRIVE_STORAGE_STALE_TIME_MS,
    enabled: !isDemo && driveConnected,
  };
}
