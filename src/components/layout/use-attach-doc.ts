"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildAttachFileBody, fetchPickerToken, postAttachFile } from "./attach-doc-api";
import { attachErrorMessage, PICKER_INVALID_MESSAGE, type AttachPhase } from "./attach-doc-state";
import {
  buildPickerOptions,
  loadPickerScript,
  openPicker,
  PickerLoadError,
  type GapiLike,
  type PickerHandle,
  type PickerNamespace,
  type PickerResult,
} from "./google-picker";
import { DRIVE_FILES_QUERY_KEY } from "./query-keys";
import { useUI } from "./ui-context";

// Luồng "Chọn từ Google Drive" của hộp thoại gắn file (T018, configured): nạp script + lấy token song song,
// mở Picker, gửi file đã chọn. Logic thuần (thông báo lỗi, nhãn, parse kết quả Picker) ở các file có test.

/** Kiểu tối thiểu của `window.gapi` / `window.google` do `api.js` gắn; khai báo cục bộ, không thêm @types. */
type PickerWindow = Window & { gapi?: GapiLike; google?: { picker?: PickerNamespace } };

function pickerWindow(): PickerWindow {
  return window as PickerWindow;
}

/** Không gian / dự án ghi lại lúc bấm nút; `projectId` rỗng = không gắn dự án. */
export interface AttachTarget {
  spaceId: string;
  projectId: string;
}

type PickedFile = Extract<PickerResult, { type: "picked" }>;

/** Nạp script + lấy token song song rồi mở Picker. Đã unmount khi xong phần chờ → không mở, trả `null`. */
async function launchPicker(
  signal: AbortSignal,
  isMounted: () => boolean,
  onResult: (result: PickerResult) => void,
): Promise<PickerHandle | null> {
  const [, token] = await Promise.all([
    loadPickerScript<HTMLScriptElement>({ doc: document, getGapi: () => pickerWindow().gapi }),
    fetchPickerToken(signal),
  ]);
  if (!isMounted()) return null;
  const ns = pickerWindow().google?.picker;
  if (!ns) throw new PickerLoadError();
  return openPicker(ns, buildPickerOptions(token), onResult);
}

/**
 * Ref cho một lượt chọn: còn mount không, Picker đang mở, fetch token đang chạy. Unmount → `dispose()`
 * Picker, abort fetch; callback đến muộn tự bỏ qua qua `isMounted()`.
 */
function usePickerSession() {
  const mounted = useRef(false);
  const running = useRef(false);
  const picker = useRef<PickerHandle | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
      picker.current?.dispose();
      picker.current = null;
    };
  }, []);

  const closePicker = () => {
    picker.current?.dispose();
    picker.current = null;
  };
  return {
    isMounted: () => mounted.current,
    /** Bắt đầu lượt mới; đang có lượt khác → `null` (chặn bấm hai lần trước khi state kịp đổi). */
    begin(): AbortSignal | null {
      if (running.current) return null;
      running.current = true;
      abort.current = new AbortController();
      return abort.current.signal;
    },
    /** Giữ Picker vừa mở; đã unmount thì đóng ngay. */
    adopt(handle: PickerHandle) {
      if (mounted.current) picker.current = handle;
      else handle.dispose();
    },
    closePicker,
    end() {
      closePicker();
      abort.current = null;
      running.current = false;
    },
  };
}

interface UseAttachDocOptions {
  /** Gắn xong: đóng hộp thoại (`onClose` gốc, không kiểm `busy`). */
  onDone: () => void;
}

export function useAttachDoc({ onDone }: UseAttachDocOptions) {
  const { notify } = useUI();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<AttachPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const session = usePickerSession();

  /** Kết thúc lượt, mở khoá hộp thoại; `message` khác `null` → hiện lỗi. */
  const stop = (message: string | null) => {
    session.end();
    if (!session.isMounted()) return;
    setError(message);
    setPhase("idle");
  };

  const attach = async (picked: PickedFile, target: AttachTarget) => {
    setPhase("attaching");
    try {
      const file = await postAttachFile(buildAttachFileBody({ driveFileId: picked.id, ...target }));
      // Lối tắt đã tạo: làm mới danh sách kể cả khi hộp thoại đã bị gỡ.
      void queryClient.invalidateQueries({ queryKey: DRIVE_FILES_QUERY_KEY });
      if (!session.isMounted()) return;
      notify(`Đã gắn “${file.name}”`);
      onDone();
    } catch (caught) {
      stop(attachErrorMessage(caught, picked.name));
    }
  };

  const handleResult = (result: PickerResult, target: AttachTarget) => {
    if (result.type === "ignore" || !session.isMounted()) return;
    session.closePicker();
    if (result.type === "cancel") stop(null);
    else if (result.type === "invalid") stop(PICKER_INVALID_MESSAGE);
    else void attach(result, target);
  };

  /** Gọi từ sự kiện bấm nút; `target` là lựa chọn lúc bấm, không đổi theo ô sau đó. */
  const choose = (target: AttachTarget) => {
    const signal = session.begin();
    if (!signal) return;
    setError(null);
    setPhase("opening");
    launchPicker(signal, session.isMounted, (result) => handleResult(result, target))
      .then((handle) => {
        if (handle) session.adopt(handle);
      })
      .catch((caught: unknown) => {
        if (session.isMounted()) stop(attachErrorMessage(caught));
      });
  };

  return { phase, error, choose };
}
