/**
 * GET /api/contacts — list contacts (filter: ?q=search, ?tag=tag).
 * POST /api/contacts — create a contact.
 *
 * The list endpoint returns each contact with a computed `interactionCount`
 * and `lastInteractionAt` (max of interactions.occurredAt) so the left rail of
 * the UI can sort contacts by recency. The tag filter is applied in JS after
 * fetch (SQLite + Prisma don't expose JSON-array contains over the
 * stringified `tags` column); for the typical personal-CRM corpus size this
 * is cheaper than a JSON-extract query and stays index-friendly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseTags(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const arr = JSON.parse(s)
    return Array.isArray(arr) ? arr.map((x) => String(x)) : []
  } catch {
    return []
  }
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim() || ''
    const tag = url.searchParams.get('tag')?.trim() || ''

    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { company: { contains: q } },
        { role: { contains: q } },
        { notes: { contains: q } },
      ]
    }

    const rows = await db.contact.findMany({
      where,
      include: {
        _count: { select: { interactions: true } },
        interactions: {
          select: { occurredAt: true },
          orderBy: { occurredAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    let mapped = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      role: r.role,
      birthday: iso(r.birthday),
      notes: r.notes,
      tags: parseTags(r.tags),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      interactionCount: r._count.interactions,
      lastInteractionAt: iso(r.interactions[0]?.occurredAt ?? null),
    }))

    if (tag) {
      mapped = mapped.filter((c) => c.tags.includes(tag))
    }

    // Sort by lastInteractionAt desc, nulls last; ties broken by createdAt desc.
    mapped.sort((a, b) => {
      const la = a.lastInteractionAt
      const lb = b.lastInteractionAt
      if (!la && !lb) return b.createdAt.localeCompare(a.createdAt)
      if (!la) return 1
      if (!lb) return -1
      return lb.localeCompare(la)
    })

    return NextResponse.json(mapped)
  } catch (e) {
    console.error('[api/contacts GET] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const tags = Array.isArray(body.tags) ? body.tags.map(String) : []
    const created = await db.contact.create({
      data: {
        name: body.name.trim(),
        email: body.email ?? null,
        phone: body.phone ?? null,
        company: body.company ?? null,
        role: body.role ?? null,
        birthday: body.birthday ? new Date(body.birthday) : null,
        notes: body.notes ?? null,
        tags: JSON.stringify(tags),
      },
    })
    return NextResponse.json({
      id: created.id,
      name: created.name,
      email: created.email,
      phone: created.phone,
      company: created.company,
      role: created.role,
      birthday: iso(created.birthday),
      notes: created.notes,
      tags: parseTags(created.tags),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      interactionCount: 0,
      lastInteractionAt: null,
    })
  } catch (e) {
    console.error('[api/contacts POST] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
