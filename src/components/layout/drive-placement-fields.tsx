"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { cx, field, secondaryButton } from "@/components/ui/styles";
import type { NamedOption } from "./create-doc-api";
import type { DrivePlacement } from "./use-drive-placement";

// Ô chọn không gian / dự án và trạng thái tải / lỗi danh sách không gian, dùng chung cho hộp thoại tạo
// tài liệu (T017) và gắn file từ Drive (T018). State nằm ở `use-drive-placement.ts`.

/** Giá trị tạm của ô dự án khi tải dự án được yêu cầu lỗi: buộc người dùng chọn một lựa chọn thật. */
const CHOOSE_PROJECT_VALUE = "__choose__";

/** Khung căn giữa cho các trạng thái trước khi có form (lỗi, chưa có không gian…). */
export const placementStatusClass = "flex flex-col items-center px-2 py-6 text-center";

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

interface DrivePlacementFieldsProps {
  spaces: readonly NamedOption[];
  placement: DrivePlacement;
  disabled: boolean;
}

/** Ô Không gian + ô Dự án nối sẵn với `useDrivePlacement`. */
export function DrivePlacementFields({ spaces, placement, disabled }: DrivePlacementFieldsProps) {
  const { projectsQuery, projectWait } = placement;
  return (
    <>
      <SpaceSelect spaces={spaces} value={placement.spaceId} onChange={placement.changeSpace} disabled={disabled} />
      <ProjectSelect
        projects={placement.projects}
        value={placement.projectId}
        onChange={placement.setProjectId}
        loading={projectsQuery.isPending}
        failed={projectsQuery.isError}
        waitFailed={projectWait === "error"}
        retrying={projectsQuery.isFetching}
        onRetry={() => void projectsQuery.refetch()}
        disabled={disabled}
      />
    </>
  );
}

interface SpaceSelectProps extends SelectProps {
  spaces: readonly NamedOption[];
}

export function SpaceSelect({ spaces, value, onChange, disabled }: SpaceSelectProps) {
  return (
    <label className="block text-sm font-medium">
      Không gian
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={cx(field, "mt-2 disabled:opacity-60")}>
        {spaces.map((space) => (
          <option key={space.id} value={space.id}>
            {space.name}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ProjectSelectProps extends SelectProps {
  projects: readonly NamedOption[];
  loading: boolean;
  failed: boolean;
  /** Tải dự án được yêu cầu lỗi: hiện "Chọn dự án…" và nút thử lại; hộp thoại chặn gửi tới khi người dùng tự chọn. */
  waitFailed: boolean;
  retrying: boolean;
  onRetry: () => void;
}

export function ProjectSelect({ projects, value, onChange, loading, failed, waitFailed, retrying, onRetry, disabled }: ProjectSelectProps) {
  return (
    <div>
      <label className="block text-sm font-medium">
        Dự án
        <select
          value={waitFailed ? CHOOSE_PROJECT_VALUE : value}
          disabled={disabled || loading}
          aria-busy={loading}
          onChange={(event) => onChange(event.target.value)}
          className={cx(field, "mt-2 disabled:opacity-60")}
        >
          {waitFailed && (
            <option value={CHOOSE_PROJECT_VALUE} disabled>
              Chọn dự án…
            </option>
          )}
          <option value="">{loading ? "Đang tải dự án…" : "Không gắn dự án"}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      {waitFailed && <ProjectsRetry retrying={retrying} onRetry={onRetry} />}
      {failed && !waitFailed && (
        <span className="mt-1 block text-xs text-muted">Không tải được danh sách dự án; tài liệu sẽ nằm trong thư mục không gian.</span>
      )}
    </div>
  );
}

interface RetryProps {
  retrying: boolean;
  onRetry: () => void;
}

/** Mở từ trang dự án mà tải dự án lỗi: thử lại, hoặc người dùng tự chọn trong ô Dự án. */
export function ProjectsRetry({ retrying, onRetry }: RetryProps) {
  return (
    <div role="alert" className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
      <span>Không tải được dự án đã chọn. Hãy thử lại hoặc chọn một lựa chọn trong ô Dự án.</span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex shrink-0 items-center gap-1 font-medium underline disabled:cursor-wait disabled:opacity-60"
      >
        <RotateCw className={cx("h-4 w-4", retrying && "animate-spin")} aria-hidden />
        {retrying ? "Đang thử lại…" : "Thử lại"}
      </button>
    </div>
  );
}

/** Đang tải danh sách không gian. */
export function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Đang tải danh sách không gian" className="space-y-5">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} aria-hidden className="space-y-2">
          <span className="block h-3 w-24 animate-pulse rounded bg-brand-faint" />
          <span className="block h-11 w-full animate-pulse rounded-lg bg-brand-faint" />
        </div>
      ))}
    </div>
  );
}

/** Tải danh sách không gian lỗi, kèm nút thử lại. */
export function SpacesError({ retrying, onRetry }: RetryProps) {
  return (
    <div role="alert" className={placementStatusClass}>
      <AlertTriangle className="mb-3 h-8 w-8 text-red-700" aria-hidden />
      <p className="text-sm font-medium">Không tải được danh sách không gian</p>
      <p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-muted">Kiểm tra kết nối mạng rồi thử lại.</p>
      <button type="button" onClick={onRetry} disabled={retrying} className={cx(secondaryButton, "disabled:cursor-wait disabled:opacity-60")}>
        <RotateCw className={cx("h-4 w-4", retrying && "animate-spin")} aria-hidden />
        {retrying ? "Đang thử lại…" : "Thử lại"}
      </button>
    </div>
  );
}
