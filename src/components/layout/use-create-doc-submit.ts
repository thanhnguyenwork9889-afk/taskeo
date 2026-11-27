"use client";

import { useState } from "react";
import { useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { DriveFileItem } from "@/domain/types";
import type { CreateFileBody } from "./create-doc-api";
import { createDocErrorMessage } from "./create-doc-state";
import { closePendingTab, finishPendingTab, openPendingTab } from "./pending-tab";
import { DRIVE_FILES_QUERY_KEY } from "./query-keys";
import { useUI } from "./ui-context";

// Luồng gửi của hộp thoại tạo tài liệu (T017): mở tab chờ, gọi API, chuyển tab / báo đã tạo / báo lỗi.

export type CreateFileMutation = UseMutationResult<DriveFileItem, Error, CreateFileBody>;

export interface CreatedFile {
  name: string;
  /** `null` = không có liên kết hợp lệ để mở. */
  url: string | null;
}

interface UseCreateDocSubmitOptions {
  mutation: CreateFileMutation;
  /** Đóng hộp thoại sau khi tạo xong; không kiểm `busy` (lúc gọi mutation đã xong). */
  onDone: () => void;
}

export function useCreateDocSubmit({ mutation, onDone }: UseCreateDocSubmitOptions) {
  const { notify } = useUI();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedFile | null>(null);

  /** Gọi ĐỒNG BỘ từ sự kiện submit: tab chờ phải mở trước mọi `await` để trình duyệt không chặn popup. */
  const submit = async (body: CreateFileBody) => {
    setError(null);
    const tab = openPendingTab(window.open.bind(window));
    let file: DriveFileItem;
    try {
      file = await mutation.mutateAsync(body);
    } catch (caught) {
      closePendingTab(tab);
      setError(createDocErrorMessage(caught));
      return;
    }
    void queryClient.invalidateQueries({ queryKey: DRIVE_FILES_QUERY_KEY });
    const outcome = finishPendingTab(tab, file.url);
    if (outcome === "opened") {
      notify(`Đã tạo ${file.name}`);
      onDone();
      return;
    }
    setCreated({ name: file.name, url: outcome === "blocked" ? file.url : null });
  };

  return { submit, error, created };
}
