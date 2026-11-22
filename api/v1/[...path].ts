type Request = import('express').Request;
type Response = import('express').Response;
type Handler = (request: Request, response: Response) => unknown;

let handler: Handler | undefined;
let importError: unknown;
try {
  handler = (require('./index') as { default: Handler }).default;
} catch (error) {
  importError = error;
}

function scrubImportError(error: unknown): string {
  const message = String((error as { message?: unknown } | null)?.message ?? error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[db-url-redacted]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email-redacted]')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export default async function safeHandler(request: Request, response: Response) {
  if (!handler) {
    response.statusCode = 500;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      error: 'preview_import_failed',
      diagnosticVersion: 3,
      detail: scrubImportError(importError),
    }));
    return;
  }
  return handler(request, response);
}
