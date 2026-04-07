import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeRequest, TatRequestError } from '../src/http.js';

function makeFetchMock(status: number, body: string, headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue({
    status,
    headers: {
      forEach(cb: (value: string, key: string) => void) {
        for (const [k, v] of Object.entries(headers)) cb(v, k);
      },
    },
    text: async () => body,
  });
}

describe('makeRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns status, headers, and parsed JSON body', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, '{"id":1}', { 'content-type': 'application/json' }));
    const res = await makeRequest('GET', 'https://example.com/api');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1 });
    expect(res.headers['content-type']).toBe('application/json');
  });

  it('falls back to string body when response is not JSON', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, 'plain text response'));
    const res = await makeRequest('GET', 'https://example.com/text');
    expect(res.body).toBe('plain text response');
  });

  it('auto-sets Content-Type: application/json for object body', async () => {
    const fetchMock = makeFetchMock(201, '{}');
    vi.stubGlobal('fetch', fetchMock);
    await makeRequest('POST', 'https://example.com/api', {}, { name: 'Alice' });
    const callHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(callHeaders['Content-Type']).toBe('application/json');
  });

  it('does not override an explicit Content-Type header', async () => {
    const fetchMock = makeFetchMock(201, '{}');
    vi.stubGlobal('fetch', fetchMock);
    await makeRequest('POST', 'https://example.com/api', { 'Content-Type': 'text/plain' }, 'raw body');
    const callHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(callHeaders['Content-Type']).toBe('text/plain');
  });

  it('serializes object body to JSON string', async () => {
    const fetchMock = makeFetchMock(201, '{}');
    vi.stubGlobal('fetch', fetchMock);
    await makeRequest('POST', 'https://example.com/api', {}, { key: 'val' });
    expect(fetchMock.mock.calls[0][1].body).toBe('{"key":"val"}');
  });

  it('sends string body as-is', async () => {
    const fetchMock = makeFetchMock(200, '{}');
    vi.stubGlobal('fetch', fetchMock);
    await makeRequest('POST', 'https://example.com/api', {}, 'raw string');
    expect(fetchMock.mock.calls[0][1].body).toBe('raw string');
  });

  it('passes method and URL to fetch', async () => {
    const fetchMock = makeFetchMock(204, '');
    vi.stubGlobal('fetch', fetchMock);
    await makeRequest('DELETE', 'https://example.com/items/42');
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/items/42');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('throws TatRequestError on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND bad.example.com')));
    await expect(makeRequest('GET', 'https://bad.example.com')).rejects.toThrow(TatRequestError);
    await expect(makeRequest('GET', 'https://bad.example.com')).rejects.toThrow('Network error');
  });

  it('throws TatRequestError with timeout message when AbortError is raised', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    }));
    await expect(makeRequest('GET', 'https://example.com', {}, undefined, 100))
      .rejects.toThrow('Request timed out after 100ms');
  });

  it('sends custom headers to fetch', async () => {
    const fetchMock = makeFetchMock(200, '{}');
    vi.stubGlobal('fetch', fetchMock);
    await makeRequest('GET', 'https://example.com', { Authorization: 'Bearer token123' });
    const callHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(callHeaders['Authorization']).toBe('Bearer token123');
  });
});
