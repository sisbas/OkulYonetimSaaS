type Request = import('express').Request;
type Response = import('express').Response;

export default function handler(_request: Request, response: Response) {
  const url = process.env.DATABASE_URL ?? '';
  let host = 'none';
  try { host = new URL(url).hostname; } catch { /* no url */ }
  response.statusCode = 200;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ host, url }));
}
