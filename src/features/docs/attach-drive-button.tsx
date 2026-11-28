"use client";

import { Suspense } from "react";
import { Link2 } from "lucide-react";
import { useUI, useViewer } from "@/components/layout/ui-context";
import { secondaryButton } from "@/components/ui/styles";
import { attachEntryAction } from "./attach-entry";

interface AttachDriveButtonProps {
  spaceId?: string;
  projectId?: string;
  /** Chế độ demo: mở hộp thoại dán liên kết của nơi gọi. Không truyền → nút ẩn ở demo. */
  onDemoAttach?: () => void;
}

/**
 * Nút "Gắn file từ Drive" (T018). Configured → hộp thoại Google Picker qua `openCreate({ kind: "attach" })`;
 * demo → `onDemoAttach` hoặc ẩn. `useViewer()` có thể suspend nên nút tự bọc <Suspense>.
 */
export function AttachDriveButton(props: AttachDriveButtonProps) {
  return (
    <Suspense fallback={null}>
      <AttachDriveButtonInner {...props} />
    </Suspense>
  );
}

function AttachDriveButtonInner({ spaceId, projectId, onDemoAttach }: AttachDriveButtonProps) {
  const { isDemo } = useViewer();
  const { openCreate } = useUI();
  const action = attachEntryAction(isDemo, onDemoAttach !== undefined);
  if (action === "hidden") return null;
  const onClick = action === "demo_dialog" ? onDemoAttach : () => openCreate({ kind: "attach", spaceId, projectId });
  return (
    <button type="button" onClick={onClick} className={secondaryButton}>
      <Link2 className="h-4 w-4" aria-hidden />
      Gắn file từ Drive
    </button>
  );
}
