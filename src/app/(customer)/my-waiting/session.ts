export interface StoredWaitingEntry {
  storeSlug: string
  phone: string
  pax: number
  queueNumber: number
  waitingId: string
  waitingCount: number
}

type WaitingRouteDecision =
  | {
      type: 'redirect'
      href: string
      entry: StoredWaitingEntry
      staleKeys: string[]
    }
  | {
      type: 'choose'
      entries: StoredWaitingEntry[]
      staleKeys: string[]
    }
  | {
      type: 'empty'
      entries: StoredWaitingEntry[]
      staleKeys: string[]
    }

interface StoredWaitingSnapshot {
  phone?: unknown
  pax?: unknown
  queueNumber?: unknown
  waitingId?: unknown
  waitingCount?: unknown
  step?: unknown
}

interface ValidStoredWaitingSnapshot {
  phone: string
  pax: number
  queueNumber: number
  waitingId: string
  waitingCount: number
  step: 3
}

function isStoredWaitingEntry(value: StoredWaitingSnapshot, storeSlug: string): value is ValidStoredWaitingSnapshot {
  return Boolean(
    storeSlug &&
    typeof value.phone === 'string' && value.phone.length > 0 &&
    typeof value.pax === 'number' && Number.isFinite(value.pax) &&
    typeof value.queueNumber === 'number' && Number.isFinite(value.queueNumber) &&
    typeof value.waitingId === 'string' && value.waitingId.length > 0 &&
    typeof value.waitingCount === 'number' && Number.isFinite(value.waitingCount) &&
    value.step === 3,
  )
}

export function getMyWaitingRouteDecision(storage: Record<string, string>): WaitingRouteDecision {
  const entries: StoredWaitingEntry[] = []
  const staleKeys: string[] = []

  for (const [key, raw] of Object.entries(storage)) {
    if (!key.startsWith('waiting:')) continue

    const storeSlug = key.slice('waiting:'.length)

    try {
      const parsed = JSON.parse(raw) as StoredWaitingSnapshot
      if (!isStoredWaitingEntry(parsed, storeSlug)) {
        staleKeys.push(key)
        continue
      }

      entries.push({
        storeSlug,
        phone: parsed.phone,
        pax: parsed.pax,
        queueNumber: parsed.queueNumber,
        waitingId: parsed.waitingId,
        waitingCount: parsed.waitingCount,
      })
    } catch {
      staleKeys.push(key)
    }
  }

  entries.sort((a, b) => a.storeSlug.localeCompare(b.storeSlug))
  staleKeys.sort()

  if (entries.length === 1) {
    return {
      type: 'redirect',
      href: `/waiting/${entries[0].storeSlug}`,
      entry: entries[0],
      staleKeys,
    }
  }

  if (entries.length > 1) {
    return {
      type: 'choose',
      entries,
      staleKeys,
    }
  }

  return {
    type: 'empty',
    entries: [],
    staleKeys,
  }
}
