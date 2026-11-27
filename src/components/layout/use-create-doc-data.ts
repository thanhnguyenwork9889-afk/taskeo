"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApiProjects, fetchApiSpaces, shouldRetryCreateDocQuery } from "./create-doc-api";
import { API_SPACES_QUERY_KEY, apiProjectsQueryKey } from "./query-keys";

// Dữ liệu cho hộp thoại tạo tài liệu ở chế độ configured (T017): không gian / dự án lấy từ API
// vì ID store demo chưa khớp DB (T59). Chế độ demo / chưa kết nối Drive → truyền `enabled: false`.

/** Không gian của người dùng (`GET /api/spaces`). */
export function useApiSpaces({ enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: API_SPACES_QUERY_KEY,
    queryFn: ({ signal }) => fetchApiSpaces(signal),
    retry: shouldRetryCreateDocQuery,
    enabled,
  });
}

/** Dự án của không gian đã chọn; `spaceId` rỗng → không gọi. */
export function useApiProjects(spaceId: string, { enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: apiProjectsQueryKey(spaceId),
    queryFn: ({ signal }) => fetchApiProjects(spaceId, signal),
    retry: shouldRetryCreateDocQuery,
    enabled: enabled && spaceId !== "",
  });
}
