"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useUI } from "@/components/layout/ui-context";
import { Modal } from "@/components/ui/modal";
import type { Project } from "@/domain/types";
import { deleteProject, projectDeletionImpact } from "@/domain/workspace-actions";
import { updateWorkspace, useWorkspace } from "@/store/workspace-store";
import { control, cx, dangerButton } from "@/components/ui/styles";

interface ProjectDeleteDialogProps {
  project: Project;
  onClose: () => void;
  /** Gọi ngay trước khi xoá để trang chi tiết render rỗng thay vì notFound() khi dự án biến mất. */
  onDeleting: () => void;
}

/** Xác nhận xoá dự án, nêu số công việc / tài liệu sẽ chuyển về không gian (không bị xoá). */
export function ProjectDeleteDialog({ project, onClose, onDeleting }: ProjectDeleteDialogProps) {
  const state = useWorkspace();
  const router = useRouter();
  const { notify } = useUI();
  const impact = projectDeletionImpact(state, project.id);

  const confirm = () => {
    // Cùng thứ tự với SpaceDeleteDialog: bật cờ trước, rồi mới đổi store, trong cùng một click
    // để React gộp một lần render — lần render thấy dự án đã mất cũng thấy cờ, không gọi notFound().
    onDeleting();
    router.replace(`/spaces/${project.spaceId}`);
    updateWorkspace((s) => deleteProject(s, project.id));
    notify(`Đã xoá dự án “${project.name}”.`);
  };

  return (
    <Modal title="Xoá dự án?" onClose={onClose}>
      <div className="space-y-3 text-sm leading-6">
        <p>
          Dự án <strong className="font-semibold">{project.name}</strong> sẽ bị xoá. Nội dung bên trong không bị xoá mà chuyển về không gian:
        </p>
        <ul className="list-disc space-y-1 pl-5">
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
          Xoá dự án
        </button>
      </div>
    </Modal>
  );
}
