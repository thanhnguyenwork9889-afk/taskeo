"use client";

import { formatStorageUsage, storageLevel, storagePercent } from "@/domain/drive-storage";
import type { DriveStorage } from "@/domain/types";
import { control, cx } from "@/components/ui/styles";
import { storageBarClass, storageBarWidth, storageTooltip } from "./drive-storage-state";
import { useDriveStorage } from "./use-drive-storage";

const TITLE = "Dung lượng Google";

/**
 * Khối dung lượng Google ở sidebar, dưới công tắc Google Drive (T016). Ẩn ở chế độ demo / chưa kết nối.
 * `usage` của Google gồm cả Gmail + Photos nên tiêu đề ghi "Dung lượng Google". Phải nằm trong `<Suspense>`.
 */
export function DriveStorageMeter() {
  const { state, storage, retry, retrying } = useDriveStorage();
  if (state === "hidden") return null;
  if (state === "loading") return <MeterSkeleton />;
  if (state === "error" || !storage) return <MeterError retry={retry} retrying={retrying} />;
  return <MeterReady storage={storage} />;
}

/** Khung chờ cao bằng trạng thái ready (tiêu đề + dòng số + thanh) để không giật layout. */
function MeterSkeleton() {
  return (
    <div aria-busy="true" className="space-y-1.5 px-2 py-1">
      <span className="sr-only">Đang tải dung lượng</span>
      <div aria-hidden className="h-4 w-24 animate-pulse rounded bg-[#E6E6EE]" />
      <div aria-hidden className="h-4 w-32 animate-pulse rounded bg-[#E6E6EE]" />
      <div aria-hidden className="h-1.5 w-full animate-pulse rounded-full bg-[#E6E6EE]" />
    </div>
  );
}

function MeterError({ retry, retrying }: { retry: () => void; retrying: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 text-xs text-[#737380]">
      <span>Không tải được dung lượng</span>
      <button
        type="button"
        onClick={retry}
        disabled={retrying}
        className={cx(control, "shrink-0 px-2 font-medium text-brand-ink hover:bg-canvas disabled:cursor-wait disabled:opacity-60")}
      >
        {retrying ? "Đang thử…" : "Thử lại"}
      </button>
    </div>
  );
}

function MeterReady({ storage }: { storage: DriveStorage }) {
  const usage = formatStorageUsage(storage);
  const percent = storagePercent(storage);
  return (
    <div title={storageTooltip(storage)} className="space-y-1.5 px-2 py-1 text-xs text-[#737380]">
      <p className="font-medium text-[#3F3F4A]">{TITLE}</p>
      <p>{usage}</p>
      {percent !== null && <MeterBar percent={percent} label={usage} />}
    </div>
  );
}

function MeterBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={`${TITLE} đã dùng`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-valuetext={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-[#E6E6EE]"
    >
      <div className={cx("h-full rounded-full", storageBarClass(storageLevel(percent)))} style={{ width: storageBarWidth(percent) }} />
    </div>
  );
}
