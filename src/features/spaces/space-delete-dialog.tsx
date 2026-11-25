"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useUI } from "@/components/layout/ui-context";
import { Modal } from "@/components/ui/modal";
import type { Space } from "@/domain/types";
import { deleteSpace, spaceDeletionImpact } from "@/domain/workspace-actions";
import { updateWorkspace, useWorkspace } from "@/store/workspace-store";
import { control, cx } from "@/components/ui/styles";

const dangerButton = `${control} inline-flex items-center justify-center gap-2 bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800`;

interface SpaceDeleteDialogProps {
  space: Space;
  onClose: () => void;
  /** Gọi ngay trước khi xoá để trang chi tiết render rỗng thay vì notFound() khi không gian biến mất. */
  onDeleting: () => void;
}

/** Xác nhận xoá không gian, nêu rõ số dự án / công việc / tài liệu sẽ mất cùng. */
export function SpaceDeleteDialog({ space, onClose, onDeleting }: SpaceDeleteDialogProps) {
  const state = useWorkspace();
  const router = useRouter();
  const { notify } = useUI();
  const impact = spaceDeletionImpact(state, space.id);

  const confirm = () => {
    // Thứ tự quan trọng: bật cờ trước, rồi mới đổi store. Cả hai cập nhật nằm trong cùng
    // một sự kiện click nên React gộp vào một lần render: lần render thấy không gian đã mất
    // cũng thấy cờ, nên không bao giờ gọi notFound(). router.replace là transition (bất đồng bộ)
    // nên không thể dựa vào nó để rời trang trước khi store đổi.
    onDeleting();
    router.replace("/spaces");
    updateWorkspace((s) => deleteSpace(s, space.id));
    notify(`Đã xoá không gian “${space.name}”.`);
  };

  return (
    <Modal title="Xoá không gian?" onClose={onClose}>
      <div className="space-y-3 text-sm leading-6">
        <p>
          Không gian <strong className="font-semibold">{space.name}</strong> sẽ bị xoá cùng toàn bộ nội dung bên trong:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{impact.projects} dự án</li>
          <li>{impact.tasks} công việc</li>
          <li>{impact.files} tài liệu</li>
        </ul>
        <p className="rounded-lg bg-red-50 p-3 font-medium text-red-800">Thao tác này không thể hoàn tác.</p>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} className={cx(control, "border border-[#E5DFED] px-4 text-sm")}>
          Hủy
        </button>
        <button type="button" onClick={confirm} className={dangerButton}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Xoá vĩnh viễn
        </button>
      </div>
    </Modal>
  );
}
