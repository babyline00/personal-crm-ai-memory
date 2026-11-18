import { test, expect, describe } from 'bun:test'
import {
  chunkInteractionsByDate,
  formatDateKey,
  recentChunks,
  type InteractionInput,
} from '../chunker'

const iso = (s: string) => new Date(s)

describe('formatDateKey', () => {
  test('formats a Date as YYYY-MM-DD (local calendar day)', () => {
    const d = new Date(2026, 0, 5, 14, 30) // Jan 5 2026 14:30 local
    expect(formatDateKey(d)).toBe('2026-01-05')
  })
  test('parses ISO string input', () => {
    expect(formatDateKey('2026-03-09T08:00:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  test('invalid date -> empty string', () => {
    expect(formatDateKey(new Date('not a date'))).toBe('')
    expect(formatDateKey('garbage')).toBe('')
  })
})

describe('chunkInteractionsByDate', () => {
  test('groups interactions by calendar day', () => {
    const ints: InteractionInput[] = [
      { id: '1', type: 'call', summary: 'morning call', occurredAt: iso('2026-01-01T08:00:00') },
      { id: '2', type: 'email', summary: 'afternoon email', occurredAt: iso('2026-01-01T15:00:00') },
      { id: '3', type: 'meeting', summary: 'lunch next day', occurredAt: iso('2026-01-02T12:00:00') },
    ]
    const chunks = chunkInteractionsByDate(ints)
    expect(chunks.length).toBe(2)
    expect(chunks[0].date).toBe('2026-01-01')
    expect(chunks[0].count).toBe(2)
    expect(chunks[0].interactionIds).toEqual(['1', '2'])
    expect(chunks[1].date).toBe('2026-01-02')
    expect(chunks[1].count).toBe(1)
  })
  test('chunks are sorted by occurredAt ascending', () => {
    const ints: InteractionInput[] = [
      { id: 'b', type: 'note', summary: 'later', occurredAt: iso('2026-05-10T00:00:00') },
      { id: 'a', type: 'note', summary: 'earlier', occurredAt: iso('2026-01-10T00:00:00') },
    ]
    const chunks = chunkInteractionsByDate(ints)
    expect(chunks[0].date).toBe('2026-01-10')
    expect(chunks[1].date).toBe('2026-05-10')
  })
  test('text field concatenates "type: summary" lines', () => {
    const ints: InteractionInput[] = [
      { id: '1', type: 'call', summary: 'hello', occurredAt: iso('2026-01-01T08:00:00') },
      { id: '2', type: 'email', summary: 'world', occurredAt: iso('2026-01-01T15:00:00') },
    ]
    const chunks = chunkInteractionsByDate(ints)
    expect(chunks[0].text).toContain('call: hello')
    expect(chunks[0].text).toContain('email: world')
  })
  test('empty input -> []', () => {
    expect(chunkInteractionsByDate([])).toEqual([])
  })
  test('drops interactions with invalid dates', () => {
    const ints: InteractionInput[] = [
      { id: '1', type: 'note', summary: 'good', occurredAt: iso('2026-01-01T00:00:00') },
      { id: '2', type: 'note', summary: 'bad', occurredAt: new Date('not a date') },
    ]
    const chunks = chunkInteractionsByDate(ints)
    expect(chunks.length).toBe(1)
    expect(chunks[0].interactionIds).toEqual(['1'])
  })
  test('single interaction -> single chunk', () => {
    const ints: InteractionInput[] = [
      { id: '1', type: 'meeting', summary: 'solo', occurredAt: iso('2026-06-15T10:00:00') },
    ]
    const chunks = chunkInteractionsByDate(ints)
    expect(chunks.length).toBe(1)
    expect(chunks[0].count).toBe(1)
    expect(chunks[0].occurredAt).toEqual(iso('2026-06-15T10:00:00'))
  })
})

describe('recentChunks', () => {
  test('returns the N most recent chunks in reverse (newest first)', () => {
    const ints: InteractionInput[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      type: 'note',
      summary: `day ${i}`,
      occurredAt: new Date(2026, 0, i + 1, 10, 0),
    }))
    const rec = recentChunks(ints, 3)
    expect(rec.length).toBe(3)
    expect(rec[0].date).toBe('2026-01-10')
    expect(rec[2].date).toBe('2026-01-08')
  })
  test('fewer chunks than N -> returns all', () => {
    const ints: InteractionInput[] = [
      { id: '1', type: 'note', summary: 'only', occurredAt: iso('2026-01-01T00:00:00') },
    ]
    expect(recentChunks(ints, 5).length).toBe(1)
  })
})
