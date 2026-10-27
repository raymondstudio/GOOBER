export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'ApiError'; }
}
export async function api<T>(path: string, input?: unknown, headers?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/v1'+path, { method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal, headers: { ...(input === undefined ? {} : { 'Content-Type': 'application/json', 'x-goober-csrf': '1' }), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('GOOBER could not be reached. Check your connection, then try again.', 0);
  }
  const body = await response.json().catch(() => null);
  // A cancelled response cannot expire a newer session after its body finishes parsing.
  signal?.throwIfAborted();
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('goober:session-expired'));
    throw new ApiError(body?.error?.message || (response.status === 401 ? 'Sign in to access your account.' : response.status === 403 ? 'Your account cannot access this action.' : 'The request could not finish. Please try again.'), response.status);
  }
  return body as T;
}
