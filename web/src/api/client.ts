import { reportNetwork } from '@/offline/network'

/** Error response shape of the Go API (see server/internal/api/httpx.go). */
interface ErrorBody {
  error?: { code: string; message: string; fields?: Record<string, string> }
}

export class ApiError extends Error {
  status: number
  code: string
  fields: Record<string, string>

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

const BASE = '/api/v1'

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

/** JSON fetch against the Go API. Same-origin cookie auth; the CSRF header is always sent. */
export async function api<T>(method: Method, path: string, body?: unknown, init?: { signal?: AbortSignal }): Promise<T> {
  const isForm = body instanceof FormData
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'newanki',
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: init?.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    reportNetwork(false)
    throw new ApiError(0, 'network', 'Sunucuya ulaşılamıyor. Bağlantınızı kontrol edin.')
  }
  // A proxy or the service worker answering 502–504 also means the API is out of reach.
  reportNetwork(res.status < 502 || res.status > 504)
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data = text ? safeJSON(text) : undefined
  if (!res.ok) {
    const err = (data as ErrorBody | undefined)?.error
    throw new ApiError(res.status, err?.code ?? 'http_' + res.status, err?.message ?? 'Beklenmeyen bir hata oluştu', err?.fields ?? {})
  }
  return data as T
}

function safeJSON(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Time-ordered UUIDv7 for client-generated uids (idempotent creates and reviews). */
export function uuidv7(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  const ts = Date.now()
  const hi = Math.floor(ts / 2 ** 32)
  const lo = ts % 2 ** 32
  b[0] = (hi >>> 8) & 0xff
  b[1] = hi & 0xff
  b[2] = (lo >>> 24) & 0xff
  b[3] = (lo >>> 16) & 0xff
  b[4] = (lo >>> 8) & 0xff
  b[5] = lo & 0xff
  b[6] = (b[6]! & 0x0f) | 0x70
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
