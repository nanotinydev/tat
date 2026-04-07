export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export class TatRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TatRequestError';
  }
}

export async function makeRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: unknown,
  timeoutMs?: number,
): Promise<HttpResponse> {
  const requestHeaders: Record<string, string> = { ...headers };
  let requestBody: string | undefined;

  if (body !== undefined && body !== null) {
    if (typeof body === 'object') {
      requestBody = JSON.stringify(body);
      if (!requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
        requestHeaders['Content-Type'] = 'application/json';
      }
    } else {
      requestBody = String(body);
    }
  }

  let controller: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (timeoutMs !== undefined) {
    controller = new AbortController();
    timeoutId = setTimeout(() => controller!.abort(), timeoutMs);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller?.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new TatRequestError(`Request timed out after ${timeoutMs}ms`);
    }
    throw new TatRequestError(`Network error: ${(e as Error).message}`);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  const text = await response.text();
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    parsedBody = text;
  }

  return {
    status: response.status,
    headers: responseHeaders,
    body: parsedBody,
  };
}
