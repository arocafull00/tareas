import type { Data } from './shared';

export interface Api {
  load: () => Promise<Data>;
  call: (method: string, ...args: unknown[]) => Promise<Data>;
  unauthorized: () => void;
}

export type ApiError = Error & { status?: number };

export function createApi(getToken: () => Promise<string | null>, unauthorized: () => void): Api {
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const token = await getToken();
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error || res.statusText), { status: res.status });
    return json;
  }

  return {
    load: () => request<Data>('/api/data'),
    call: (method, ...args) => request<{ data: Data }>('/api/rpc', { method, args }).then(r => r.data),
    unauthorized,
  };
}
