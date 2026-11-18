/**
 * GET    /api/contacts/[id] — full detail with interactions + recent follow-up drafts.
 * PATCH  /api/contacts/[id] — update contact fields.
 * DELETE /api/contacts/[id] — cascade-deletes interactions + drafts.
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const c = await db.contact.findUnique({
      where: { id },
      include: {
        interactions: { orderBy: { occurredAt: 'desc' } },
        followUps: { orderBy: { createdAt: 'desc' }, take: 6 },
      },
    })
    if (!c) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const contact = {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      company: c.company,
      role: c.role,
      birthday: iso(c.birthday),
      notes: c.notes,
      tags: parseTags(c.tags),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      interactionCount: c.interactions.length,
      lastInteractionAt: iso(c.interactions[0]?.occurredAt ?? null),
    }
    const interactions = c.interactions.map((i) => ({
      id: i.id,
      contactId: i.contactId,
      type: i.type,
      summary: i.summary,
      occurredAt: i.occurredAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    }))
    const drafts = c.followUps.map((d) => ({
      id: d.id,
      contactId: d.contactId,
      tonePreset: d.tonePreset,
      content: d.content,
      createdAt: d.createdAt.toISOString(),
    }))
    return NextResponse.json({ contact, interactions, drafts })
  } catch (e) {
    console.error('[api/contacts/:id GET] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const existing = await db.contact.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if ('email' in body) data.email = body.email ?? null
    if ('phone' in body) data.phone = body.phone ?? null
    if ('company' in body) data.company = body.company ?? null
    if ('role' in body) data.role = body.role ?? null
    if ('notes' in body) data.notes = body.notes ?? null
    if ('birthday' in body) data.birthday = body.birthday ? new Date(body.birthday) : null
    if ('tags' in body) {
      const tags = Array.isArray(body.tags) ? body.tags.map(String) : []
      data.tags = JSON.stringify(tags)
    }

    const updated = await db.contact.update({ where: { id }, data })
    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      company: updated.company,
      role: updated.role,
      birthday: iso(updated.birthday),
      notes: updated.notes,
      tags: parseTags(updated.tags),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      interactionCount: existing.interactions?.length ?? 0,
      lastInteractionAt: null,
    })
  } catch (e) {
    console.error('[api/contacts/:id PATCH] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const existing = await db.contact.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    await db.contact.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/contacts/:id DELETE] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
