/**
 * GET /api/alerts — upcoming birthdays (next 30 days) + milestone interactions
 * (next round number 10/25/50/100/...).
 *
 * Both alerts are computed by the pure functions in `@/lib/alerts`. The
 * route handler is a thin orchestrator: load all contacts with their
 * interaction counts, map to the AlertContact shape, and call the pure
 * functions. This keeps the heavy logic unit-testable in isolation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { upcomingBirthdays, buildMilestoneAlerts, type AlertContact } from '@/lib/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const rows = await db.contact.findMany({
      select: {
        id: true,
        name: true,
        birthday: true,
        _count: { select: { interactions: true } },
      },
    })

    const birthdayContacts: AlertContact[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      birthday: r.birthday,
    }))
    const counts = new Map<string, number>(rows.map((r) => [r.id, r._count.interactions]))

    const birthdays = upcomingBirthdays(birthdayContacts, 30)
    const milestones = buildMilestoneAlerts(
      rows.map((r) => ({ id: r.id, name: r.name })),
      counts,
    )

    return NextResponse.json({
      birthdays: birthdays.map((b) => ({
        contact: {
          id: b.contact.id,
          name: b.contact.name,
          birthday: b.contact.birthday ? new Date(b.contact.birthday).toISOString() : null,
        },
        birthday: b.birthday.toISOString(),
        daysUntil: b.daysUntil,
        turningAge: b.turningAge,
      })),
      milestones: milestones.map((m) => ({
        contact: { id: m.contact.id, name: m.contact.name },
        interactionCount: m.interactionCount,
        nextMilestone: m.nextMilestone,
        interactionsUntil: m.interactionsUntil,
      })),
    })
  } catch (e) {
    console.error('[api/alerts GET] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
