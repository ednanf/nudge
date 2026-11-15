export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class CheckError extends Error {}
export function safeCheckError(error: unknown): string {
  return error instanceof CheckError
    ? error.message
    : 'Connection failed or the request timed out. Verify the endpoint and try again.';
}
