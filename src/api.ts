export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(response.status, 'The server returned an unreadable response.');
  }
  if (!response.ok) throw new ApiError(response.status, result.error || 'Request failed.');
  return result as T;
}
