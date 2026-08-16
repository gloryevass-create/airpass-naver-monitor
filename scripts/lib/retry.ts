export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  onRetry?: (error: unknown, attempt: number) => void;
};

/** API 실패는 최대 3회 자동 재시도(지수 백오프). 실패 처리 스펙 참고. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 1000, onRetry }: RetryOptions = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      onRetry?.(error, attempt);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}
