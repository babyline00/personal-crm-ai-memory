/**
 * POST /api/contacts/[id]/interactions — log a new interaction.
 * GET  /api/contacts/[id]/interactions — list (most recent first).
 *
 * Logging an interaction also bumps the parent contact's `updatedAt` so the
 * left rail re-sorts on recency even when nothing else about the contact
 * changed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_TYPES = new Set(['meeting', 'call', 'email', 'note', 'other'])

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const body = await req.json()
    if (!body || typeof body.summary !== 'string' || !body.summary.trim()) {
      return NextResponse.json({ error: 'summary is required' }, { status: 400 })
    }
    const type = VALID_TYPES.has(body.type) ? body.type : 'note'
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date()
    if (isNaN(occurredAt.getTime())) {
      return NextResponse.json({ error: 'occurredAt is not a valid date' }, { status: 400 })
    }
    const contact = await db.contact.findUnique({ where: { id } })
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const created = await db.interaction.create({
      data: {
        contactId: id,
        type,
        summary: body.summary.trim(),
        occurredAt,
      },
    })
    // bump contact.updatedAt so the list re-sorts
    await db.contact.update({ where: { id }, data: {} })
    return NextResponse.json({
      id: created.id,
      contactId: created.contactId,
      type: created.type,
      summary: created.summary,
      occurredAt: created.occurredAt.toISOString(),
      createdAt: created.createdAt.toISOString(),
    })
  } catch (e) {
    console.error('[api/contacts/:id/interactions POST] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const contact = await db.contact.findUnique({ where: { id }, select: { id: true } })
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    const interactions = await db.interaction.findMany({
      where: { contactId: id },
      orderBy: { occurredAt: 'desc' },
    })
    return NextResponse.json(
      interactions.map((i) => ({
        id: i.id,
        contactId: i.contactId,
        type: i.type,
        summary: i.summary,
        occurredAt: i.occurredAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
      })),
    )
  } catch (e) {
    console.error('[api/contacts/:id/interactions GET] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
