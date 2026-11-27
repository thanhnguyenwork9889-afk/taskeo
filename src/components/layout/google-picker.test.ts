import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { DOC_KIND_MIME, DRIVE_FILE_UNNAMED } from "@/domain/drive-files";
import type { PickerTokenResponse } from "@/domain/types";
import {
  PICKER_SCRIPT_ID,
  PICKER_SCRIPT_URL,
  PickerLoadError,
  SCRIPT_LOAD_FAILED_CODE,
  buildPickerOptions,
  loadPickerScript,
  openPicker,
  parsePickerResult,
  type GapiLike,
  type GapiLoadConfig,
  type PickerDocument,
  type PickerLoaderCache,
  type PickerNamespace,
  type PickerResult,
  type ScriptElementLike,
} from "./google-picker";

const VALID_ID = "1AbCdEfGhIjKlMnOp_-123";

interface FakeScript extends ScriptElementLike {
  removed: boolean;
}

function fakeDoc() {
  const scripts: FakeScript[] = [];
  const doc: PickerDocument<FakeScript> = {
    getElementById: (id) => scripts.find((script) => script.id === id && !script.removed) ?? null,
    createElement: () => {
      const script: FakeScript = {
        id: "",
        src: "",
        async: false,
        onload: null,
        onerror: null,
        removed: false,
        remove() {
          script.removed = true;
        },
      };
      return script;
    },
    head: {
      appendChild: (node) => {
        scripts.push(node);
        return node;
      },
    },
  };
  const live = () => scripts.filter((script) => !script.removed);
  return { doc, scripts, live };
}

type LoadBehavior = (config: GapiLoadConfig) => void;

function fakeGapi(behavior: LoadBehavior = (config) => config.callback()) {
  const load = vi.fn<(name: "picker", config: GapiLoadConfig) => void>((_name, config) => behavior(config));
  const gapi: GapiLike = { load };
  return { gapi, load };
}

function freshCache(): PickerLoaderCache {
  return { promise: null };
}

async function loadError(promise: Promise<unknown>): Promise<PickerLoadError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PickerLoadError);
    return error as PickerLoadError;
  }
  throw new Error("expected rejection");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("loadPickerScript", () => {
  it("Document thật khớp kiểu PickerDocument", () => {
    expectTypeOf<Document>().toExtend<PickerDocument<HTMLScriptElement>>();
  });

  it("2 lần gọi đồng thời → gắn đúng 1 script, cả hai cùng xong", async () => {
    const { doc, scripts } = fakeDoc();
    const { gapi, load } = fakeGapi();
    const holder: { gapi?: GapiLike } = {};
    const cache = freshCache();

    const first = loadPickerScript({ doc, getGapi: () => holder.gapi, cache });
    const second = loadPickerScript({ doc, getGapi: () => holder.gapi, cache });

    expect(second).toBe(first);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({ id: PICKER_SCRIPT_ID, src: PICKER_SCRIPT_URL, async: true });

    holder.gapi = gapi;
    scripts[0].onload?.(new Event("load"));
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toBe("picker");
  });

  it("đã xong thì lần gọi sau dùng lại, không gắn thêm script", async () => {
    const { doc, scripts } = fakeDoc();
    const { gapi } = fakeGapi();
    const holder: { gapi?: GapiLike } = {};
    const cache = freshCache();
    const first = loadPickerScript({ doc, getGapi: () => holder.gapi, cache });
    holder.gapi = gapi;
    scripts[0].onload?.(new Event("load"));
    await first;

    await loadPickerScript({ doc, getGapi: () => holder.gapi, cache });
    expect(scripts).toHaveLength(1);
  });

  it("script onerror → reject script_load_failed, gỡ script, gọi lại được", async () => {
    const { doc, scripts, live } = fakeDoc();
    const cache = freshCache();
    const first = loadPickerScript({ doc, getGapi: () => undefined, cache });
    scripts[0].onerror?.(new Event("error"));

    const error = await loadError(first);
    expect(error.code).toBe(SCRIPT_LOAD_FAILED_CODE);
    expect(live()).toHaveLength(0);
    expect(cache.promise).toBeNull();

    const { gapi } = fakeGapi();
    const holder: { gapi?: GapiLike } = {};
    const retry = loadPickerScript({ doc, getGapi: () => holder.gapi, cache });
    expect(scripts).toHaveLength(2);
    holder.gapi = gapi;
    scripts[1].onload?.(new Event("load"));
    await expect(retry).resolves.toBeUndefined();
  });

  it("script tải xong nhưng không có gapi → reject", async () => {
    const { doc, scripts } = fakeDoc();
    const promise = loadPickerScript({ doc, getGapi: () => undefined, cache: freshCache() });
    scripts[0].onload?.(new Event("load"));
    expect((await loadError(promise)).code).toBe(SCRIPT_LOAD_FAILED_CODE);
  });

  it("script không phản hồi quá timeoutMs → reject, gỡ script", async () => {
    vi.useFakeTimers();
    const { doc, live } = fakeDoc();
    const promise = loadPickerScript({ doc, getGapi: () => undefined, timeoutMs: 1000, cache: freshCache() });
    const settled = loadError(promise);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await settled).code).toBe(SCRIPT_LOAD_FAILED_CODE);
    expect(live()).toHaveLength(0);
  });

  it("gapi có sẵn → không gắn script, chỉ gapi.load với timeout", async () => {
    const { doc, scripts } = fakeDoc();
    const { gapi, load } = fakeGapi();
    await loadPickerScript({ doc, getGapi: () => gapi, timeoutMs: 5000, cache: freshCache() });
    expect(scripts).toHaveLength(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][1].timeout).toBe(5000);
  });

  it.each([
    ["ontimeout", (config: GapiLoadConfig) => config.ontimeout()],
    ["onerror", (config: GapiLoadConfig) => config.onerror()],
    ["ném lỗi", () => {
      throw new Error("boom");
    }],
  ] as const)("gapi.load %s → reject script_load_failed, gọi lại được", async (_label, behavior) => {
    const { doc } = fakeDoc();
    const cache = freshCache();
    const failing = fakeGapi(behavior);
    const error = await loadError(loadPickerScript({ doc, getGapi: () => failing.gapi, cache }));
    expect(error.code).toBe(SCRIPT_LOAD_FAILED_CODE);
    expect(error.message).not.toContain("boom");

    const ok = fakeGapi();
    await expect(loadPickerScript({ doc, getGapi: () => ok.gapi, cache })).resolves.toBeUndefined();
  });
});

const TOKEN: PickerTokenResponse = {
  accessToken: "ya29.token",
  expiresAt: "2026-11-27T09:00:00.000Z",
  developerKey: "AIza-key",
  appId: "123456789012",
};

describe("buildPickerOptions", () => {
  it("lấy đủ trường từ token, 3 mime Docs/Sheets/Slides, locale vi", () => {
    expect(buildPickerOptions(TOKEN)).toEqual({
      oauthToken: "ya29.token",
      developerKey: "AIza-key",
      appId: "123456789012",
      mimeTypes: [DOC_KIND_MIME.doc, DOC_KIND_MIME.sheet, DOC_KIND_MIME.slide].join(","),
      locale: "vi",
    });
  });

  it("không sửa token", () => {
    const token = { ...TOKEN };
    buildPickerOptions(token);
    expect(token).toEqual(TOKEN);
  });
});

function fakeNamespace() {
  const calls: Array<[string, unknown]> = [];
  let callback: ((data: unknown) => void) | null = null;
  const picker = { setVisible: vi.fn(), dispose: vi.fn() };

  class DocsView {
    constructor(viewId: string) {
      calls.push(["DocsView", viewId]);
    }
    setMimeTypes(value: string) {
      calls.push(["setMimeTypes", value]);
      return this;
    }
    setIncludeFolders(value: boolean) {
      calls.push(["setIncludeFolders", value]);
      return this;
    }
  }

  class PickerBuilder {
    addView(view: unknown) {
      calls.push(["addView", view instanceof DocsView]);
      return this;
    }
    enableFeature(feature: unknown) {
      calls.push(["enableFeature", feature]);
      return this;
    }
    setOAuthToken(value: string) {
      calls.push(["setOAuthToken", value]);
      return this;
    }
    setDeveloperKey(value: string) {
      calls.push(["setDeveloperKey", value]);
      return this;
    }
    setAppId(value: string) {
      calls.push(["setAppId", value]);
      return this;
    }
    setLocale(value: string) {
      calls.push(["setLocale", value]);
      return this;
    }
    setCallback(value: (data: unknown) => void) {
      callback = value;
      calls.push(["setCallback", typeof value]);
      return this;
    }
    build() {
      calls.push(["build", null]);
      return picker;
    }
  }

  const ns: PickerNamespace = { DocsView, PickerBuilder, ViewId: { DOCS: "all" } };
  return { ns, calls, picker, fire: (data: unknown) => callback?.(data) };
}

describe("openPicker", () => {
  const options = buildPickerOptions(TOKEN);

  it("dựng DocsView 3 mime, không thư mục, builder đủ setter, hiện Picker; không MULTISELECT", () => {
    const { ns, calls, picker } = fakeNamespace();
    openPicker(ns, options, vi.fn());

    expect(calls).toEqual([
      ["DocsView", "all"],
      ["setMimeTypes", options.mimeTypes],
      ["setIncludeFolders", false],
      ["addView", true],
      ["setOAuthToken", "ya29.token"],
      ["setDeveloperKey", "AIza-key"],
      ["setAppId", "123456789012"],
      ["setLocale", "vi"],
      ["setCallback", "function"],
      ["build", null],
    ]);
    expect(calls.some(([name]) => name === "enableFeature")).toBe(false);
    expect(picker.setVisible).toHaveBeenCalledWith(true);
  });

  it("callback chuyển kết quả đã parse", () => {
    const { ns, fire } = fakeNamespace();
    const onResult = vi.fn<(result: PickerResult) => void>();
    openPicker(ns, options, onResult);
    fire({ action: "cancel" });
    expect(onResult).toHaveBeenCalledWith({ type: "cancel" });
  });

  it("dispose gọi picker.dispose và bỏ qua callback muộn", () => {
    const { ns, fire, picker } = fakeNamespace();
    const onResult = vi.fn<(result: PickerResult) => void>();
    const handle = openPicker(ns, options, onResult);
    handle.dispose();
    fire({ action: "cancel" });
    expect(picker.dispose).toHaveBeenCalledTimes(1);
    expect(onResult).not.toHaveBeenCalled();
  });

  it("picker không có dispose → dispose vẫn chạy", () => {
    const { ns } = fakeNamespace();
    const bare: PickerNamespace = {
      ...ns,
      PickerBuilder: class extends ns.PickerBuilder {
        build() {
          return { setVisible: () => undefined };
        }
      },
    };
    expect(() => openPicker(bare, options, vi.fn()).dispose()).not.toThrow();
  });
});

describe("parsePickerResult", () => {
  const picked = (doc: Record<string, unknown>) => ({ action: "picked", docs: [doc] });

  it.each([
    ["doc", DOC_KIND_MIME.doc],
    ["sheet", DOC_KIND_MIME.sheet],
    ["slide", DOC_KIND_MIME.slide],
  ] as const)("picked %s → id, tên, kind", (kind, mimeType) => {
    expect(parsePickerResult(picked({ id: VALID_ID, name: "Kế hoạch", mimeType }))).toEqual({
      type: "picked",
      id: VALID_ID,
      name: "Kế hoạch",
      kind,
    });
  });

  it("tên rỗng / khoảng trắng / thiếu → tên mặc định", () => {
    const base = { id: VALID_ID, mimeType: DOC_KIND_MIME.doc };
    for (const name of ["", "   ", undefined]) {
      expect(parsePickerResult(picked({ ...base, name }))).toMatchObject({ name: DRIVE_FILE_UNNAMED });
    }
  });

  it("tên được trim", () => {
    expect(parsePickerResult(picked({ id: VALID_ID, name: "  A  ", mimeType: DOC_KIND_MIME.doc }))).toMatchObject({ name: "A" });
  });

  it("cancel → cancel; loaded / action lạ → ignore", () => {
    expect(parsePickerResult({ action: "cancel" })).toEqual({ type: "cancel" });
    expect(parsePickerResult({ action: "loaded" })).toEqual({ type: "ignore" });
    expect(parsePickerResult({ action: "something" })).toEqual({ type: "ignore" });
  });

  it.each([
    ["docs rỗng", { action: "picked", docs: [] }],
    ["thiếu docs", { action: "picked" }],
    ["id sai mẫu", picked({ id: "../x", name: "A", mimeType: DOC_KIND_MIME.doc })],
    ["id thiếu", picked({ name: "A", mimeType: DOC_KIND_MIME.doc })],
    ["mime PDF", picked({ id: VALID_ID, name: "A.pdf", mimeType: "application/pdf" })],
    ["mime thư mục", picked({ id: VALID_ID, name: "F", mimeType: "application/vnd.google-apps.folder" })],
    ["doc không phải object", { action: "picked", docs: ["x"] }],
  ])("%s → invalid", (_label, data) => {
    expect(parsePickerResult(data)).toEqual({ type: "invalid" });
  });

  it.each([null, undefined, "picked", 42, []])("dữ liệu không phải object (%s) → ignore", (data) => {
    expect(parsePickerResult(data)).toEqual({ type: "ignore" });
  });
});
