import { test, expect, describe } from 'bun:test'
import {
  upcomingBirthdays,
  nextMilestone,
  buildMilestoneAlerts,
  type AlertContact,
} from '../alerts'

const NOW = new Date('2026-03-15T12:00:00Z')

function b(month: number, day: number, year = 1990): AlertContact {
  return {
    id: `c-${month}-${day}`,
    name: `Person ${month}/${day}`,
    birthday: new Date(year, month - 1, day, 0, 0, 0),
  }
}

describe('upcomingBirthdays', () => {
  test('includes a birthday within the next 30 days', () => {
    const alerts = upcomingBirthdays([b(3, 20)], 30, NOW) // 5 days away
    expect(alerts.length).toBe(1)
    expect(alerts[0].daysUntil).toBe(5)
  })
  test('includes a birthday TODAY (daysUntil = 0)', () => {
    const alerts = upcomingBirthdays([b(3, 15)], 30, NOW)
    expect(alerts.length).toBe(1)
    expect(alerts[0].daysUntil).toBe(0)
  })
  test('excludes a birthday 31 days out (boundary)', () => {
    const alerts = upcomingBirthdays([b(4, 15)], 30, NOW) // 31 days away
    expect(alerts.length).toBe(0)
  })
  test('excludes a birthday that already passed this year (rolls to next year, > 30 days)', () => {
    const alerts = upcomingBirthdays([b(2, 1)], 30, NOW) // passed in Feb, next is ~350 days out
    expect(alerts.length).toBe(0)
  })
  test('excludes contacts with no birthday', () => {
    const alerts = upcomingBirthdays([{ id: 'noBday', name: 'No Birthday' }], 30, NOW)
    expect(alerts).toEqual([])
  })
  test('excludes contacts with an unparseable birthday', () => {
    const alerts = upcomingBirthdays(
      [{ id: 'bad', name: 'Bad', birthday: new Date('not a date') }],
      30,
      NOW,
    )
    expect(alerts).toEqual([])
  })
  test('sorts by daysUntil ascending', () => {
    const alerts = upcomingBirthdays([b(4, 10), b(3, 16), b(3, 20)], 30, NOW)
    expect(alerts.map((a) => a.daysUntil)).toEqual([1, 5, 26])
  })
  test('computes turningAge when birthday has a real year', () => {
    const alerts = upcomingBirthdays([b(3, 20, 1990)], 30, NOW) // turns 36 in 2026
    expect(alerts[0].turningAge).toBe(36)
  })
  test('turningAge is null when birthday year is a placeholder (<= 1900)', () => {
    const alerts = upcomingBirthdays([b(3, 20, 1900)], 30, NOW)
    expect(alerts[0].turningAge).toBeNull()
  })
  test('accepts ISO string birthdays', () => {
    const alerts = upcomingBirthdays(
      [{ id: 'iso', name: 'ISO', birthday: '2026-03-20T00:00:00' }],
      30,
      NOW,
    )
    expect(alerts.length).toBe(1)
    expect(alerts[0].daysUntil).toBe(5)
  })
})

describe('nextMilestone', () => {
  test('0 -> 10', () => { expect(nextMilestone(0)).toBe(10) })
  test('9 -> 10', () => { expect(nextMilestone(9)).toBe(10) })
  test('10 -> 25', () => { expect(nextMilestone(10)).toBe(25) })
  test('24 -> 25', () => { expect(nextMilestone(24)).toBe(25) })
  test('25 -> 50', () => { expect(nextMilestone(25)).toBe(50) })
  test('49 -> 50', () => { expect(nextMilestone(49)).toBe(50) })
  test('50 -> 100', () => { expect(nextMilestone(50)).toBe(100) })
  test('99 -> 100', () => { expect(nextMilestone(99)).toBe(100) })
  test('100 -> 150', () => { expect(nextMilestone(100)).toBe(150) })
  test('149 -> 150', () => { expect(nextMilestone(149)).toBe(150) })
  test('200 -> 250', () => { expect(nextMilestone(200)).toBe(250) })
  test('500 -> 750', () => { expect(nextMilestone(500)).toBe(750) })
  test('beyond the table rolls to next multiple of 1000', () => {
    expect(nextMilestone(10001)).toBe(11000)
  })
})

describe('buildMilestoneAlerts', () => {
  test('returns alerts sorted by interactionsUntil ascending', () => {
    const contacts: AlertContact[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]
    const counts = new Map<string, number>([
      ['a', 8],  // 2 until 10
      ['b', 24], // 1 until 25
      ['c', 49], // 1 until 50
    ])
    const alerts = buildMilestoneAlerts(contacts, counts)
    expect(alerts.length).toBe(3)
    expect(alerts[0].nextMilestone - alerts[0].interactionCount).toBeLessThanOrEqual(
      alerts[2].nextMilestone - alerts[2].interactionCount,
    )
  })
  test('skips contacts with 0 interactions', () => {
    const alerts = buildMilestoneAlerts(
      [{ id: 'a', name: 'A' }],
      new Map([['a', 0]]),
    )
    expect(alerts).toEqual([])
  })
  test('skips contacts missing from the counts map', () => {
    const alerts = buildMilestoneAlerts(
      [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      new Map([['a', 10]]),
    )
    expect(alerts.length).toBe(1)
    expect(alerts[0].contact.id).toBe('a')
  })
})
