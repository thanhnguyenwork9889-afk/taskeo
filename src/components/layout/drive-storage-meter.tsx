"use client";

import { useId } from "react";
import { storageLevel, storagePercent } from "@/domain/drive-storage";
import type { DriveStorage } from "@/domain/types";
import { control, cx } from "@/components/ui/styles";
import { storageBarClass, storageBarWidth, storageStatusText, storageTooltip, type DriveStorageViewState } from "./drive-storage-state";
import { useDriveStorage } from "./use-drive-storage";

const TITLE = "Dung lượng Google";

/**
 * Khung cố định 58px cho mọi trạng thái (py-1 + 50px nội dung: tiêu đề 16 + dòng số 16 + thanh 6 + 2 khoảng 6),
 * nên đổi loading → error / ready (có hay không thanh) không làm sidebar nhảy. Nút Thử lại 44px nằm gọn trong 50px.
 */
const METER_BOX = "flex h-[58px] flex-col justify-center gap-1.5 px-2 py-1 text-xs text-[#737380]";
const SKELETON = "animate-pulse rounded bg-[#E6E6EE]";

/**
 * Khối dung lượng Google ở sidebar, dưới công tắc Google Drive (T016). Ẩn ở chế độ demo / chưa kết nối.
 * `usage` của Google gồm cả Gmail + Photos nên tiêu đề ghi "Dung lượng Google". Phải nằm trong `<Suspense>`.
 * Dòng chữ giữa là vùng `role="status"` luôn nằm cùng chỗ trong cây, nên kết quả tải / thử lại được đọc;
 * thanh tiến độ nằm ngoài vùng đó để không bị đọc lại.
 */
export function DriveStorageMeter() {
  const { state, storage, retry, retrying } = useDriveStorage();
  const detailsId = useId();
  if (state === "hidden") return null;
  const ready = state === "ready" && storage !== null ? storage : null;
  return (
    <div aria-busy={state === "loading"} title={ready ? storageTooltip(ready) : undefined} className={METER_BOX}>
      <MeterTitle state={state} />
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p role="status" aria-live="polite" className={state === "loading" ? "sr-only" : "min-w-0"}>
          {storageStatusText({ state, storage, retrying })}
        </p>
        {state === "loading" && <div aria-hidden className={cx(SKELETON, "h-4 w-32")} />}
        {state === "error" && <RetryButton retry={retry} retrying={retrying} />}
      </div>
      <MeterTrack state={state} storage={ready} detailsId={detailsId} />
      {ready && (
        <span id={detailsId} className="sr-only">
          {storageTooltip(ready)}
        </span>
      )}
    </div>
  );
}

function MeterTitle({ state }: { state: DriveStorageViewState }) {
  if (state === "loading") return <div aria-hidden className={cx(SKELETON, "h-4 w-24")} />;
  if (state !== "ready") return null;
  return <p className="font-medium text-[#3F3F4A]">{TITLE}</p>;
}

/** Hàng thanh tiến độ: khung chờ khi tải; không giới hạn → giữ chỗ trống cùng chiều cao. */
function MeterTrack({ state, storage, detailsId }: { state: DriveStorageViewState; storage: DriveStorage | null; detailsId: string }) {
  if (state === "loading") return <div aria-hidden className={cx(SKELETON, "h-1.5 w-full rounded-full")} />;
  if (!storage) return null;
  const percent = storagePercent(storage);
  if (percent === null) return <div aria-hidden className="h-1.5" />;
  return <MeterBar percent={percent} label={storageStatusText({ state, storage, retrying: false })} detailsId={detailsId} />;
}

/** Không dùng `disabled` để focus không rơi về body khi đang thử lại; chặn bấm bằng `aria-disabled`. */
function RetryButton({ retry, retrying }: { retry: () => void; retrying: boolean }) {
  return (
    <button
      type="button"
      onClick={retrying ? undefined : retry}
      aria-disabled={retrying}
      className={cx(
        control,
        "shrink-0 px-2 font-medium text-brand-ink hover:bg-canvas aria-disabled:cursor-wait aria-disabled:opacity-60",
      )}
    >
      Thử lại
    </button>
  );
}

function MeterBar({ percent, label, detailsId }: { percent: number; label: string; detailsId: string }) {
  return (
    <div
      role="progressbar"
      aria-label={`${TITLE} đã dùng`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-valuetext={label}
      aria-describedby={detailsId}
      className="h-1.5 w-full overflow-hidden rounded-full bg-[#E6E6EE]"
    >
      <div className={cx("h-full rounded-full", storageBarClass(storageLevel(percent)))} style={{ width: storageBarWidth(percent) }} />
    </div>
  );
}
