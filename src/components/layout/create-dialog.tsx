"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { DOC_KIND_LABEL, DOC_KINDS } from "@/domain/labels";
import type { DocKind } from "@/domain/types";
import { createFile, createProject, createSpace, createTask, projectNameExists } from "@/domain/workspace-actions";
import { updateWorkspace, useWorkspace } from "@/store/workspace-store";
import { control, cx, field, primaryButton } from "@/components/ui/styles";
import { useUI, type CreateRequest } from "./ui-context";

const TITLES: Record<CreateRequest["kind"], string> = {
  task: "Tạo công việc mới",
  space: "Tạo không gian mới",
  project: "Tạo dự án mới",
  doc: "Tạo tài liệu mới",
};

const NOTES: Record<CreateRequest["kind"], string> = {
  task: "Chế độ demo: công việc được lưu trên trình duyệt này.",
  space: "Giai đoạn 3 sẽ tự tạo thư mục Google Drive cho không gian.",
  project: "Giai đoạn 3 sẽ tạo thư mục con trên Drive cho dự án.",
  doc: "Chế độ demo: chưa tạo tệp trên Google Drive.",
};

export function CreateDialog({ request, onClose }: { request: CreateRequest; onClose: () => void }) {
  const workspace = useWorkspace();
  const { spaces, projects } = workspace;
  const { notify } = useUI();
  const router = useRouter();
  const [title, setTitle] = useState("");
  // Có dự án thì không gian lấy theo dự án, để form luôn hiện đúng nơi công việc sẽ được lưu.
  const requestedProject = "projectId" in request ? projects.find((p) => p.id === request.projectId) : undefined;
  const [spaceId, setSpaceId] = useState(requestedProject?.spaceId || ("spaceId" in request && request.spaceId) || spaces[0]?.id || "");
  const [projectId, setProjectId] = useState(requestedProject?.id ?? "");
  const [docKind, setDocKind] = useState<DocKind>((request.kind === "doc" && request.docKind) || "doc");

  const spaceProjects = projects.filter((p) => p.spaceId === spaceId);
  const needsSpace = request.kind !== "space";
  const showProjectPicker = request.kind === "task" || request.kind === "doc";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    if (needsSpace && !spaceId) {
      notify("Hãy tạo một không gian trước.");
      return;
    }
    const stamp = new Date();
    if (request.kind === "space") {
      updateWorkspace((s) => createSpace(s, title));
    } else if (request.kind === "project") {
      if (projectNameExists(workspace, spaceId, title)) {
        notify("Tên dự án đã tồn tại trong không gian này.");
        return;
      }
      updateWorkspace((s) => createProject(s, spaceId, title, stamp));
    } else if (request.kind === "doc") {
      updateWorkspace((s) => createFile(s, { name: title, kind: docKind, spaceId, projectId: projectId || null }, stamp));
    } else {
      updateWorkspace((s) => createTask(s, { title, spaceId, projectId: projectId || null, dueDate: null }, stamp));
    }
    notify("Đã tạo mới.");
    onClose();
    if (request.kind === "space") router.push("/spaces");
  };

  return (
    <Modal title={TITLES[request.kind]} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <label className="block text-sm font-medium">
          Tên
          <input
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={request.kind === "space" ? "Ví dụ: Dự án cá nhân" : "Bạn đang lên kế hoạch gì?"}
            className={cx(field, "mt-2")}
          />
        </label>

        {request.kind === "doc" && (
          <label className="block text-sm font-medium">
            Loại tài liệu
            <select value={docKind} onChange={(event) => setDocKind(event.target.value as DocKind)} className={cx(field, "mt-2")}>
              {DOC_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {DOC_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </label>
        )}

        {needsSpace && (
          <>
            <label className="block text-sm font-medium">
              Không gian
              <select
                value={spaceId}
                onChange={(event) => {
                  setSpaceId(event.target.value);
                  setProjectId("");
                }}
                className={cx(field, "mt-2")}
              >
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </label>
            {showProjectPicker && (
              <label className="block text-sm font-medium">
                Dự án
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={cx(field, "mt-2")}>
                  <option value="">Không gắn dự án</option>
                  {spaceProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        <p className="text-xs leading-5 text-muted">{NOTES[request.kind]}</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={cx(control, "border border-[#E5E3ED] px-4 text-sm")}>
            Hủy
          </button>
          <button type="submit" className={primaryButton}>
            Tạo mới
          </button>
        </div>
      </form>
    </Modal>
  );
}
