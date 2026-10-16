export async function api<T>(path: string, input?: unknown, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: { ...(input === undefined ? {} : { 'Content-Type': 'application/json', 'x-goober-csrf': '1' }), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || (response.status === 401 ? 'Sign in to access your account.' : 'The request could not finish. Please try again.'));
  return body as T;
}
