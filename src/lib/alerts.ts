/**
 * Birthday + milestone alerts.
 *
 * Two pure functions:
 *  - `upcomingBirthdays(contacts, days, now)` returns contacts whose next
 *    birthday falls within `days` days from `now` (inclusive of today),
 *    sorted by days-until ascending.
 *  - `nextMilestone(count)` returns the next round-number interaction count
 *    (10, 25, 50, 100, 150, 200, 250, ...).
 *
 * Both are PURE (no IO, no globals) so they can be unit-tested in isolation.
 * `upcomingBirthdays` accepts an optional `now` for deterministic testing.
 */

export interface AlertContact {
  id: string
  name: string
  birthday?: Date | string | null
}

export interface BirthdayAlert {
  contact: AlertContact
  /** The Date of the upcoming birthday occurrence (this year or next). */
  birthday: Date
  /** Whole days from `now` until the birthday (0 = today). */
  daysUntil: number
  /** Age the contact will turn, or null if the birthday has no real year. */
  turningAge: number | null
}

export interface MilestoneAlert {
  contact: AlertContact
  interactionCount: number
  nextMilestone: number
  interactionsUntil: number
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Compute the next occurrence of the birthday and the age the contact will
 * turn on it.
 *
 *  - the next occurrence is the same month/day THIS year, or next year if
 *    that date has already passed
 *  - turningAge is `nextOccurrenceYear - birthdayYear` only when the stored
 *    birthday has a real year (year > 1900); a 1900 placeholder yields null
 *  - Feb 29 birthdays are clamped to Feb 28 on non-leap years (JavaScript
 *    Date already does this via `new Date(year, 1, 29)` -> Mar 1 on non-leap
 *    years; we don't fight it, so a Feb 29 birthday may surface on Mar 1 on
 *    a non-leap year — acceptable for an alerting layer)
 */
function nextBirthday(birthday: Date, now: Date): { date: Date; turningAge: number | null } {
  const bMonth = birthday.getMonth()
  const bDay = birthday.getDate()
  const bYear = birthday.getFullYear()
  let next = new Date(now.getFullYear(), bMonth, bDay)
  if (next.getTime() < startOfDay(now).getTime()) {
    next = new Date(now.getFullYear() + 1, bMonth, bDay)
  }
  const turningAge = bYear > 1900 ? next.getFullYear() - bYear : null
  return { date: next, turningAge }
}

/**
 * Return contacts whose next birthday is within `days` days of `now`
 * (inclusive of today: a birthday today -> daysUntil = 0 -> included).
 *
 * Contacts with no birthday, or an unparseable birthday, are skipped.
 */
export function upcomingBirthdays(
  contacts: AlertContact[],
  days = 30,
  now: Date = new Date(),
): BirthdayAlert[] {
  const today = startOfDay(now)
  const out: BirthdayAlert[] = []
  for (const c of contacts) {
    if (!c.birthday) continue
    const b = c.birthday instanceof Date ? c.birthday : new Date(c.birthday)
    if (isNaN(b.getTime())) continue
    const { date, turningAge } = nextBirthday(b, now)
    const daysUntil = Math.round(
      (date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
    )
    if (daysUntil >= 0 && daysUntil <= days) {
      out.push({ contact: c, birthday: date, daysUntil, turningAge })
    }
  }
  out.sort((a, b) => a.daysUntil - b.daysUntil)
  return out
}

/**
 * Canonical milestone thresholds. The early ones (10/25/50/100) are the
 * spec'd headline milestones; beyond 100 we progress in 50s up to 500, then
 * 250s up to 2000, then 500s/1000s. Anything beyond the table rolls to the
 * next multiple of 1000.
 */
const MILESTONES = [
  10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500,
  1750, 2000, 2500, 3000, 4000, 5000, 7500, 10000,
]

/**
 * Return the smallest canonical milestone strictly greater than `count`.
 * Beyond the largest tabulated milestone, returns the next multiple of 1000.
 */
export function nextMilestone(count: number): number {
  for (const m of MILESTONES) {
    if (m > count) return m
  }
  return Math.ceil((count + 1) / 1000) * 1000
}

/**
 * Build a milestone alert per contact given their current interaction count.
 * Only contacts that HAVE interactions are returned (a contact with 0
 * interactions has no milestone to chase).
 */
export function buildMilestoneAlerts(
  contacts: AlertContact[],
  interactionCounts: Map<string, number>,
): MilestoneAlert[] {
  const out: MilestoneAlert[] = []
  for (const c of contacts) {
    const count = interactionCounts.get(c.id) ?? 0
    if (count <= 0) continue
    const m = nextMilestone(count)
    out.push({
      contact: c,
      interactionCount: count,
      nextMilestone: m,
      interactionsUntil: m - count,
    })
  }
  // Sort by interactions-until ascending (closest milestone first)
  out.sort((a, b) => a.interactionsUntil - b.interactionsUntil)
  return out
}
