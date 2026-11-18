import { test, expect, describe } from 'bun:test'
import {
  summarizeInteractions,
  retrieveRelevantChunks,
  type RecapInteraction,
} from '../recap'

const ints: RecapInteraction[] = [
  { id: '1', type: 'meeting', summary: 'Talked about the hiring plan and the roadmap.', occurredAt: new Date('2026-01-10T10:00:00Z') },
  { id: '2', type: 'call', summary: 'Discussed the hiring plan again.', occurredAt: new Date('2026-02-01T10:00:00Z') },
  { id: '3', type: 'email', summary: 'Sent the roadmap draft.', occurredAt: new Date('2026-02-05T10:00:00Z') },
  { id: '4', type: 'note', summary: 'Reminder: follow up on hiring.', occurredAt: new Date('2026-02-10T10:00:00Z') },
]

describe('summarizeInteractions', () => {
  test('returns top-K keywords by frequency', () => {
    const r = summarizeInteractions(ints, 5)
    // 'hiring' appears 3x, 'roadmap' appears 2x, 'plan' appears 1x, etc.
    expect(r.keywords.length).toBeGreaterThan(0)
    expect(r.keywords).toContain('hiring')
    expect(r.keywords).toContain('roadmap')
    expect(r.keywords.indexOf('hiring')).toBeLessThan(r.keywords.indexOf('roadmap'))
  })
  test('respects topK limit', () => {
    const r = summarizeInteractions(ints, 2)
    expect(r.keywords.length).toBeLessThanOrEqual(2)
  })
  test('keywords are deduped', () => {
    const r = summarizeInteractions(ints, 10)
    const unique = new Set(r.keywords)
    expect(unique.size).toBe(r.keywords.length)
  })
  test('empty input -> safe-mode recap', () => {
    const r = summarizeInteractions([])
    expect(r.keywords).toEqual([])
    expect(r.summary).toContain('No interactions')
    expect(r.interactionCount).toBe(0)
    expect(r.dateRange).toEqual({})
  })
  test('summary is a single sentence mentioning top keywords', () => {
    const r = summarizeInteractions(ints, 5)
    expect(r.summary.split('.').length).toBeGreaterThanOrEqual(1)
    // The summary should mention at least one of the top keywords
    const mentions = r.keywords.slice(0, 3).some((k) => r.summary.includes(k))
    expect(mentions).toBe(true)
  })
  test('dateRange covers earliest to latest occurredAt', () => {
    const r = summarizeInteractions(ints, 5)
    expect(r.dateRange.from).toBe('2026-01-10')
    expect(r.dateRange.to).toBe('2026-02-10')
  })
  test('interactionCount matches input length', () => {
    expect(summarizeInteractions(ints).interactionCount).toBe(4)
  })
  test('summary without extractable keywords falls back to count line', () => {
    const stopOnly: RecapInteraction[] = [
      { id: 'x', type: 'note', summary: 'the a an of to in on', occurredAt: new Date('2026-01-01T00:00:00Z') },
    ]
    const r = summarizeInteractions(stopOnly)
    expect(r.keywords).toEqual([])
    expect(r.summary).toContain('1 interaction')
  })
})

describe('retrieveRelevantChunks', () => {
  test('returns chunks ranked by relevance to the query', async () => {
    const r = await retrieveRelevantChunks(ints, 'hiring plan', 3)
    expect(r.length).toBeGreaterThan(0)
    // The chunk containing "hiring" should rank highly
    expect(r.some((c) => c.text.includes('hiring'))).toBe(true)
  })
  test('empty interactions -> []', async () => {
    const r = await retrieveRelevantChunks([], 'anything', 5)
    expect(r).toEqual([])
  })
  test('falls back to recent chunks when query has no usable tokens', async () => {
    const r = await retrieveRelevantChunks(ints, 'the a an of', 2)
    expect(r.length).toBe(2)
    // newest chunk should be first
    expect(r[0].date).toBe('2026-02-10')
  })
  test('respects topK', async () => {
    const r = await retrieveRelevantChunks(ints, 'hiring', 2)
    expect(r.length).toBeLessThanOrEqual(2)
  })
  test('returns chunks whose text is from the original interactions', async () => {
    const r = await retrieveRelevantChunks(ints, 'roadmap', 3)
    for (const c of r) {
      expect(c.text.length).toBeGreaterThan(0)
      expect(c.count).toBeGreaterThanOrEqual(1)
    }
  })
})
