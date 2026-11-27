import "server-only";

export type DeadlineOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

function timeoutError(message: string): Error {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

/**
 * Chạy `work(signal)` trong hạn tổng `timeoutMs`; không bao giờ ném.
 *
 * - Xong trước hạn → `{ ok: true, value }`; signal KHÔNG bị huỷ.
 * - `work` ném / reject trước hạn → `{ ok: false, error }` và huỷ signal (AbortError mặc định) để
 *   các request song song khác còn đang bay bị huỷ theo.
 * - Hết hạn → `controller.abort(TimeoutError)` huỷ request đang chạy (signal được chuyển tới
 *   gaxios) và trả ngay `{ ok: false, error: TimeoutError }`, kể cả khi lỗi về trước là AbortError
 *   do chính việc huỷ gây ra. Kết quả muộn của `work` (resolve hay reject) bị bỏ qua, không thành
 *   unhandled rejection (`Promise.race` đã gắn handler).
 *
 * `work` phải tự gọi `signal.throwIfAborted()` giữa các bước để không bắt đầu lời gọi mới sau hạn.
 * Nơi gọi tự phân loại và log `error` — tuyệt đối không log `message` / `config` của nó.
 */
export async function runWithDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<DeadlineOutcome<T>> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = timeoutError(timeoutMessage);
      timedOut = true;
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    // `work()` trong async wrapper: lỗi ném đồng bộ cũng thành promise bị từ chối.
    const value = await Promise.race([(async () => work(controller.signal))(), deadline]);
    return { ok: true, value };
  } catch (error) {
    const reported: unknown = timedOut ? controller.signal.reason : error;
    if (!controller.signal.aborted) controller.abort();
    return { ok: false, error: reported };
  } finally {
    clearTimeout(timer);
  }
}
