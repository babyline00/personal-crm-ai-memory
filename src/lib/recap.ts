/**
 * "Last talked about" recap.
 *
 * `summarizeInteractions(interactions, topK)` is the PURE function spec'd in
 * the project brief: tokenize every interaction summary, rank terms by
 * frequency, return the top-K keywords + a 1-sentence summary + a date
 * range. No IO, no globals — fully unit-testable.
 *
 * `retrieveRelevantChunks(interactions, query, topK)` is the optional hybrid
 * retrieval path used by the LLM narrative: it chunks interactions by date,
 * builds an in-memory BM25 + vector index, fuses the rankings with RRF, and
 * returns the most relevant date-chunks. This is what "pulls most relevant
 * past interactions, not just most recent" — the LLM narrative then grounds
 * itself in those chunks instead of the last N interactions.
 */

import { tokenize } from './tokenizer'
import { chunkInteractionsByDate, type InteractionChunk } from './chunker'
import { BM25Index } from './bm25'
import { getEmbeddingProvider, cosine } from './embeddings'
import { reciprocalRankFusion, type RankedHit } from './hybrid-search'

export interface RecapInteraction {
  id: string
  type: string
  summary: string
  occurredAt: Date | string
}

export interface Recap {
  keywords: string[]
  summary: string
  interactionCount: number
  dateRange: { from?: string; to?: string }
}

function toDate(d: Date | string): Date | null {
  const x = d instanceof Date ? d : new Date(d)
  return isNaN(x.getTime()) ? null : x
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Pure keyword-frequency recap. Returns top-K keywords + a 1-sentence summary.
 *
 *  - empty input -> { keywords: [], summary: 'No interactions logged yet.', ... }
 *  - keywords are deduped (the tokenizer already lowercases + drops stop words,
 *    so dedup is mostly belt-and-braces)
 *  - the 1-sentence summary surfaces the top-3 keywords, or a count-only line
 *    if no keywords survive tokenization
 */
export function summarizeInteractions(interactions: RecapInteraction[], topK = 5): Recap {
  if (!interactions.length) {
    return {
      keywords: [],
      summary: 'No interactions logged yet.',
      interactionCount: 0,
      dateRange: {},
    }
  }

  const freq = new Map<string, number>()
  for (const it of interactions) {
    const toks = tokenize(it.summary)
    for (const t of toks) {
      freq.set(t, (freq.get(t) ?? 0) + 1)
    }
  }

  // Sort by freq desc, then alpha for stable tie-break. Dedup by word.
  const ranked = Array.from(freq.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0].localeCompare(b[0])
  })
  const seen = new Set<string>()
  const keywords: string[] = []
  for (const [word] of ranked) {
    if (seen.has(word)) continue
    seen.add(word)
    keywords.push(word)
    if (keywords.length >= topK) break
  }

  const dates = interactions
    .map((i) => toDate(i.occurredAt))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())
  const dateRange = dates.length
    ? { from: isoDate(dates[0]), to: isoDate(dates[dates.length - 1]) }
    : {}

  const top = keywords.slice(0, 3)
  const summary = top.length
    ? `You've mostly talked about ${top.join(', ')}.`
    : `You've logged ${interactions.length} interaction${interactions.length === 1 ? '' : 's'} with no extractable keywords.`

  return {
    keywords,
    summary,
    interactionCount: interactions.length,
    dateRange,
  }
}

/**
 * Hybrid-retrieval recap path. Returns the top-K most relevant date-chunks
 * for the given query (typically the contact's tags + notes + role, so the
 * retrieval surfaces the interactions that actually relate to the contact's
 * professional context rather than just the most recent chat).
 *
 * Falls back to the N most-recent chunks when the query has no usable tokens
 * (so the LLM narrative still has SOMETHING to ground itself in).
 */
export async function retrieveRelevantChunks(
  interactions: RecapInteraction[],
  query: string,
  topK = 5,
): Promise<InteractionChunk[]> {
  const chunks = chunkInteractionsByDate(interactions)
  if (!chunks.length) return []
  if (!tokenize(query).length) {
    return chunks.slice(-topK).reverse()
  }

  const docs = chunks.map((c) => ({ id: c.date, tokens: tokenize(c.text) }))
  const bm25 = new BM25Index(docs)
  const bm25Hits = bm25.search(query, topK * 2)

  const provider = getEmbeddingProvider()
  const qVec = await provider.embed(query)
  const vecHits: RankedHit[] = []
  for (const c of chunks) {
    const v = await provider.embed(c.text)
    vecHits.push({ id: c.date, score: cosine(qVec, v) })
  }
  vecHits.sort((a, b) => b.score - a.score)
  const topVec = vecHits.slice(0, topK * 2)

  const fused = reciprocalRankFusion([bm25Hits, topVec], { topK })
  const byId = new Map(chunks.map((c) => [c.date, c]))
  return fused.map((f) => byId.get(f.id)).filter((c): c is InteractionChunk => !!c)
}
