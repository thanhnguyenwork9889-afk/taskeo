"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { control, cx } from "@/components/ui/styles";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
  /** Phần tử nhận focus khi mở (vd. nút "Huỷ" của hộp xác nhận nguy hiểm). Mặc định: ô nhập đầu tiên, rồi phần tử focus được đầu tiên. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** `false` → Esc, bấm ra ngoài và nút X không đóng (vd. khi đang gửi). Mặc định `true`. */
  dismissible?: boolean;
}

const ENABLED_FIELDS = "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])";
const FOCUSABLE = `button:not([disabled]), [href], ${ENABLED_FIELDS}, [tabindex]:not([tabindex='-1'])`;

/** Hộp thoại có giữ focus bên trong, đóng bằng Esc hoặc bấm ra ngoài, trả focus khi đóng. */
export function Modal({ title, onClose, children, size = "md", initialFocusRef, dismissible = true }: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [onClose, dismissible]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = dialog.current;
    const first = initialFocusRef?.current ?? root?.querySelector<HTMLElement>(ENABLED_FIELDS) ?? root?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissibleRef.current) onCloseRef.current();
      if (event.key === "Tab") trapTab(event, dialog.current);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
    // initialFocusRef là object của useRef (ổn định) → effect chỉ chạy khi mở.
  }, [initialFocusRef]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cx("max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl", size === "md" ? "max-w-md" : "max-w-lg")}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="modal-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={!dismissible}
            className={cx(control, "flex w-11 items-center justify-center disabled:opacity-40")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Giữ Tab / Shift+Tab trong hộp thoại; không còn phần tử nào focus được thì chặn Tab thoát ra. */
function trapTab(event: KeyboardEvent, root: HTMLElement | null) {
  const nodes = root?.querySelectorAll<HTMLElement>(FOCUSABLE);
  if (!nodes?.length) {
    event.preventDefault();
    return;
  }
  const firstNode = nodes[0];
  const lastNode = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === firstNode) {
    event.preventDefault();
    lastNode.focus();
  } else if (!event.shiftKey && document.activeElement === lastNode) {
    event.preventDefault();
    firstNode.focus();
  }
}
