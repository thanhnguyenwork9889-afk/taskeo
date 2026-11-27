"use client";

import { useState, type FormEvent } from "react";
import { useUI } from "@/components/layout/ui-context";
import { Modal } from "@/components/ui/modal";
import type { Project } from "@/domain/types";
import { driveUrlSchema } from "@/domain/validation";
import { createFile, kindFromDriveUrl } from "@/domain/workspace-actions";
import { updateWorkspace, useWorkspace } from "@/store/workspace-store";
import { control, cx, field, primaryButton } from "@/components/ui/styles";

/**
 * Chế độ demo: gắn file Drive có sẵn bằng cách dán liên kết, ghi vào store. Chế độ configured
 * dùng hộp thoại Google Picker (`openCreate({ kind: "attach" })`, T018) thay cho hộp thoại này.
 */
export function AttachDriveDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { files } = useWorkspace();
  const { notify } = useUI();
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = driveUrlSchema.safeParse(link);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Liên kết không hợp lệ.");
      return;
    }
    const url = new URL(parsed.data).href;
    const typedName = name.trim();
    const displayName = typedName || "Tài liệu từ Google Drive";
    // Tên mặc định được phép trùng; chỉ chặn trùng URL hoặc trùng tên người dùng tự đặt.
    if (files.some((f) => f.projectId === project.id && (f.url === url || (typedName && f.name === typedName)))) {
      setError("Tệp hoặc tên này đã được gắn vào dự án.");
      return;
    }
    updateWorkspace((s) =>
      createFile(s, { name: displayName, kind: kindFromDriveUrl(url), spaceId: project.spaceId, projectId: project.id, url }, new Date()),
    );
    notify("Đã gắn liên kết Drive vào dự án.");
    onClose();
  };

  return (
    <Modal title="Gắn file từ Drive" onClose={onClose} size="lg">
      <p className="mb-5 rounded-lg bg-[#F5F1FB] p-3 text-sm leading-6 text-muted">
        Chế độ demo: dán liên kết tệp Google để gắn vào dự án; liên kết chỉ lưu trong trình duyệt này, app không đọc nội dung hay đổi quyền chia sẻ.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium">
          Tên hiển thị
          <input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Bản nháp bài viết" className={cx(field, "mt-2")} />
        </label>
        <label className="block text-sm font-medium">
          Liên kết Google Drive
          <input
            required
            type="url"
            value={link}
            onChange={(event) => {
              setLink(event.target.value);
              setError("");
            }}
            placeholder="https://docs.google.com/..."
            aria-describedby={error ? "drive-error" : undefined}
            aria-invalid={Boolean(error)}
            className={cx(field, "mt-2")}
          />
        </label>
        {error && (
          <p id="drive-error" role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={cx(control, "border border-[#E5DFED] px-4 text-sm")}>
            Hủy
          </button>
          <button type="submit" className={primaryButton}>
            Gắn liên kết
          </button>
        </div>
      </form>
    </Modal>
  );
}
