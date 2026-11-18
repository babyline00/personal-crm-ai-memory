/**
 * Interaction chunker — splits a contact's interactions into date-bucketed
 * chunks. Each chunk represents one calendar day of contact and is the unit
 * of retrieval for the "last talked about" recap: instead of always showing
 * the most RECENT interactions, the recap uses hybrid (BM25 + vector)
 * retrieval over these date-chunks to pull the most RELEVANT past day of
 * conversation — which is what you actually want before drafting a follow-up.
 *
 * This module is PURE (no IO, no globals) so it can be unit-tested in
 * isolation.
 */

export interface InteractionInput {
  id: string
  type: string // "meeting" | "call" | "email" | "note" | "other"
  summary: string
  occurredAt: Date | string
}

export interface InteractionChunk {
  /** Calendar date in YYYY-MM-DD form (stable string key). */
  date: string
  /** The interactions rolled into this chunk, in occurredAt order. */
  interactionIds: string[]
  /** Concatenated "type: summary" lines, one per interaction. */
  text: string
  /** Number of interactions in this chunk. */
  count: number
  /** The first occurredAt timestamp in the chunk (Date). */
  occurredAt: Date
}

/**
 * Format a Date / ISO string as a stable YYYY-MM-DD key. Done by hand rather
 * than `toISOString().slice(0,10)` so the bucket reflects the LOCAL calendar
 * day (the user cares about "what day did we talk", not the UTC day).
 */
export function formatDateKey(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Group interactions by calendar day. Within a day, interactions are kept in
 * occurredAt order. Days are returned sorted by occurredAt ascending.
 *
 * Empty interactions -> []. Interactions with an invalid date are dropped.
 */
export function chunkInteractionsByDate(interactions: InteractionInput[]): InteractionChunk[] {
  const buckets = new Map<string, InteractionChunk>()
  for (const it of interactions) {
    const key = formatDateKey(it.occurredAt)
    if (!key) continue
    const d = it.occurredAt instanceof Date ? it.occurredAt : new Date(it.occurredAt)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        date: key,
        interactionIds: [],
        text: '',
        count: 0,
        occurredAt: d,
      }
      buckets.set(key, bucket)
    }
    bucket.interactionIds.push(it.id)
    bucket.text += (bucket.text ? '\n' : '') + `${it.type}: ${it.summary}`
    bucket.count += 1
    if (d.getTime() < bucket.occurredAt.getTime()) {
      bucket.occurredAt = d
    }
  }
  const out = Array.from(buckets.values())
  out.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
  return out
}

/**
 * Convenience: the N most recent date-chunks. Used by the recap UI as the
 * default "recent context" when no retrieval query is supplied.
 */
export function recentChunks(interactions: InteractionInput[], n = 5): InteractionChunk[] {
  const all = chunkInteractionsByDate(interactions)
  return all.slice(-n).reverse()
}
