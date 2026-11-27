import { DOC_KIND_MIME, DRIVE_FILE_UNNAMED } from "@/domain/drive-files";
import type { DocKind, PickerTokenResponse } from "@/domain/types";
import { DRIVE_FILE_ID_PATTERN } from "@/domain/validation";

// Nạp và mở Google Picker (T018). Hàm thuần + kiểu tối thiểu viết tay cho `gapi` / `google.picker`
// (không thêm @types); `document` / `gapi` truyền vào để test không cần jsdom.

/** Script Google API client; chỉ nạp khi người dùng bấm "Chọn từ Google Drive". */
export const PICKER_SCRIPT_URL = "https://apis.google.com/js/api.js";
/** `id` của thẻ `<script>` do loader gắn. */
export const PICKER_SCRIPT_ID = "taskeo-google-api-script";
/** Hạn chờ mặc định cho cả việc tải script và `gapi.load("picker")`. */
export const PICKER_LOAD_TIMEOUT_MS = 15_000;
/** `code` của `PickerLoadError`. */
export const SCRIPT_LOAD_FAILED_CODE = "script_load_failed";

const PICKER_LOCALE = "vi";
const PICKER_MIME_TYPES = [DOC_KIND_MIME.doc, DOC_KIND_MIME.sheet, DOC_KIND_MIME.slide].join(",");
const LOAD_FAILED_MESSAGE = "Không tải được Google Picker";

/** Không tải được script / module Picker (mạng, trình chặn quảng cáo, quá hạn). */
export class PickerLoadError extends Error {
  readonly code = SCRIPT_LOAD_FAILED_CODE;

  constructor() {
    super(LOAD_FAILED_MESSAGE);
    this.name = "PickerLoadError";
  }
}

// ---- Kiểu tối thiểu ----

export interface ScriptElementLike {
  id: string;
  src: string;
  async: boolean;
  onload: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  remove(): void;
}

/** Phần `Document` loader cần; `document` thật khớp với `S = HTMLScriptElement`. */
export interface PickerDocument<S extends ScriptElementLike = ScriptElementLike> {
  getElementById(id: string): { remove(): void } | null;
  createElement(tagName: "script"): S;
  head: { appendChild(node: S): unknown };
}

export interface GapiLoadConfig {
  callback: () => void;
  onerror: () => void;
  timeout: number;
  ontimeout: () => void;
}

export interface GapiLike {
  load(name: "picker", config: GapiLoadConfig): void;
}

export interface PickerDocsView {
  setMimeTypes(mimeTypes: string): PickerDocsView;
  setIncludeFolders(include: boolean): PickerDocsView;
}

export interface PickerInstance {
  setVisible(visible: boolean): void;
  dispose?(): void;
}

export interface PickerBuilderLike {
  addView(view: PickerDocsView): PickerBuilderLike;
  setOAuthToken(token: string): PickerBuilderLike;
  setDeveloperKey(key: string): PickerBuilderLike;
  setAppId(appId: string): PickerBuilderLike;
  setLocale(locale: string): PickerBuilderLike;
  setCallback(callback: (data: unknown) => void): PickerBuilderLike;
  build(): PickerInstance;
}

/** `google.picker` (chỉ phần dùng tới). */
export interface PickerNamespace {
  DocsView: new (viewId: string) => PickerDocsView;
  PickerBuilder: new () => PickerBuilderLike;
  ViewId: { DOCS: string };
}

// ---- Nạp script ----

/** Ghi nhớ promise nạp; lỗi → đặt lại `null` để thử lại được. */
export interface PickerLoaderCache {
  promise: Promise<void> | null;
}

const moduleCache: PickerLoaderCache = { promise: null };

export interface LoadPickerScriptDeps<S extends ScriptElementLike = ScriptElementLike> {
  doc: PickerDocument<S>;
  getGapi: () => GapiLike | undefined;
  timeoutMs?: number;
  /** Mặc định: ghi nhớ cấp module (một lần cho cả trang). */
  cache?: PickerLoaderCache;
}

function injectScript<S extends ScriptElementLike>(doc: PickerDocument<S>, timeoutMs: number): Promise<void> {
  doc.getElementById(PICKER_SCRIPT_ID)?.remove();
  return new Promise((resolve, reject) => {
    const script = doc.createElement("script");
    const finish = (failed: boolean) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (failed) reject(new PickerLoadError());
      else resolve();
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    script.id = PICKER_SCRIPT_ID;
    script.src = PICKER_SCRIPT_URL;
    script.async = true;
    script.onload = () => finish(false);
    script.onerror = () => finish(true);
    doc.head.appendChild(script);
  });
}

function loadPickerModule(gapi: GapiLike, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new PickerLoadError());
    gapi.load("picker", { callback: () => resolve(), onerror: fail, timeout: timeoutMs, ontimeout: fail });
  });
}

async function loadOnce<S extends ScriptElementLike>(deps: LoadPickerScriptDeps<S>, timeoutMs: number): Promise<void> {
  if (!deps.getGapi()) await injectScript(deps.doc, timeoutMs);
  const gapi = deps.getGapi();
  if (!gapi) throw new PickerLoadError();
  await loadPickerModule(gapi, timeoutMs);
}

/**
 * Nạp `api.js` (nếu `gapi` chưa có) đúng một lần rồi `gapi.load("picker")`. Gọi đồng thời dùng chung một
 * promise. Lỗi / quá hạn → `PickerLoadError` (`script_load_failed`), xoá ghi nhớ và gỡ script để thử lại được.
 */
export function loadPickerScript<S extends ScriptElementLike>(deps: LoadPickerScriptDeps<S>): Promise<void> {
  const { doc, timeoutMs = PICKER_LOAD_TIMEOUT_MS, cache = moduleCache } = deps;
  if (cache.promise) return cache.promise;
  const promise = loadOnce(deps, timeoutMs).catch((error: unknown) => {
    cache.promise = null;
    doc.getElementById(PICKER_SCRIPT_ID)?.remove();
    throw error instanceof PickerLoadError ? error : new PickerLoadError();
  });
  cache.promise = promise;
  return promise;
}

// ---- Cấu hình + mở Picker ----

export interface PickerOptions {
  oauthToken: string;
  developerKey: string;
  appId: string;
  /** 3 mimeType Docs / Sheets / Slides nối bằng ",". */
  mimeTypes: string;
  locale: string;
}

/** Token từ `GET /api/drive/picker-token` → cấu hình Picker. Không sửa `token`. */
export function buildPickerOptions(token: PickerTokenResponse): PickerOptions {
  return {
    oauthToken: token.accessToken,
    developerKey: token.developerKey,
    appId: token.appId,
    mimeTypes: PICKER_MIME_TYPES,
    locale: PICKER_LOCALE,
  };
}

export interface PickerHandle {
  /** Đóng Picker (nếu hỗ trợ) và bỏ qua mọi callback đến sau. */
  dispose(): void;
}

/** Mở Picker một file (không thư mục, không MULTISELECT); `onResult` nhận kết quả đã parse. */
export function openPicker(ns: PickerNamespace, options: PickerOptions, onResult: (result: PickerResult) => void): PickerHandle {
  let disposed = false;
  const view = new ns.DocsView(ns.ViewId.DOCS).setMimeTypes(options.mimeTypes).setIncludeFolders(false);
  const picker = new ns.PickerBuilder()
    .addView(view)
    .setOAuthToken(options.oauthToken)
    .setDeveloperKey(options.developerKey)
    .setAppId(options.appId)
    .setLocale(options.locale)
    .setCallback((data) => {
      if (!disposed) onResult(parsePickerResult(data));
    })
    .build();
  picker.setVisible(true);
  return {
    dispose() {
      disposed = true;
      picker.dispose?.();
    },
  };
}

// ---- Kết quả Picker ----

export type PickerResult =
  | { type: "picked"; id: string; name: string; kind: DocKind }
  | { type: "cancel" }
  | { type: "ignore" }
  | { type: "invalid" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function kindFromMime(mimeType: unknown): DocKind | null {
  const entry = Object.entries(DOC_KIND_MIME).find(([, mime]) => mime === mimeType);
  return entry ? (entry[0] as DocKind) : null;
}

function parsePickedDoc(docs: unknown): PickerResult {
  const first: unknown = Array.isArray(docs) ? docs[0] : undefined;
  if (!isRecord(first)) return { type: "invalid" };
  const { id, name, mimeType } = first;
  const kind = kindFromMime(mimeType);
  if (typeof id !== "string" || !DRIVE_FILE_ID_PATTERN.test(id) || !kind) return { type: "invalid" };
  const trimmed = typeof name === "string" ? name.trim() : "";
  return { type: "picked", id, name: trimmed || DRIVE_FILE_UNNAMED, kind };
}

/**
 * Dữ liệu callback Picker (khoá chuỗi `action`, `docs[0].id/name/mimeType`) → kết quả. `picked` sai
 * (không có file, ID sai mẫu, không phải Docs / Sheets / Slides) → `invalid`; `loaded` / lạ → `ignore`.
 */
export function parsePickerResult(data: unknown): PickerResult {
  if (!isRecord(data)) return { type: "ignore" };
  if (data.action === "cancel") return { type: "cancel" };
  if (data.action === "picked") return parsePickedDoc(data.docs);
  return { type: "ignore" };
}
