"use client";

import { useState } from "react";
import type { NamedOption } from "./create-doc-api";
import { initialProjectId, initialSpaceId, requestedProjectWait } from "./create-doc-state";
import { useApiProjects } from "./use-create-doc-data";

// Chọn không gian / dự án đích trong Drive cho hộp thoại tạo tài liệu (T017) và gắn file (T018).
// Logic chọn sẵn nằm ở `create-doc-state.ts` (hàm thuần, có test); hook này chỉ giữ state.

export interface DrivePlacementRequest {
  /** ID không gian khi mở hộp thoại; không có trong danh sách API (vd. ID store demo) → không gian đầu. */
  spaceId?: string;
  /** ID dự án khi mở hộp thoại (vd. mở từ trang dự án). */
  projectId?: string;
}

/**
 * State chọn chỗ đặt file. Dự án: `projectChoice === null` = người dùng chưa chọn → dùng `initialProjectId`
 * khi danh sách dự án của không gian ban đầu đã tải; đổi không gian → reset về "Không gắn dự án".
 * `projectWait` khác `null` → đang chờ / lỗi tải dự án được yêu cầu, hộp thoại phải chặn gửi.
 */
export function useDrivePlacement(request: DrivePlacementRequest, spaces: readonly NamedOption[]) {
  const [startSpaceId] = useState(() => initialSpaceId(request.spaceId, spaces));
  const [spaceId, setSpaceId] = useState(startSpaceId);
  const [projectChoice, setProjectChoice] = useState<string | null>(null);
  const projectsQuery = useApiProjects(spaceId, { enabled: true });
  const projects = projectsQuery.data ?? [];
  const inStartSpace = spaceId === startSpaceId;
  const defaultProjectId = inStartSpace ? initialProjectId(request.projectId, projects) : "";
  const projectWait = requestedProjectWait({
    requestedProjectId: request.projectId,
    projectChoice,
    inStartSpace,
    projectsStatus: projectsQuery.status,
  });
  const changeSpace = (id: string) => {
    setSpaceId(id);
    setProjectChoice("");
  };
  return {
    spaceId,
    /** `""` = không gắn dự án. */
    projectId: projectChoice ?? defaultProjectId,
    projects,
    projectsQuery,
    projectWait,
    changeSpace,
    setProjectId: setProjectChoice,
  };
}

export type DrivePlacement = ReturnType<typeof useDrivePlacement>;
