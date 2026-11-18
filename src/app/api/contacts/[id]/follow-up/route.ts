/**
 * POST /api/contacts/[id]/follow-up — body `{ tonePreset }`.
 *
 * Pulls the contact + their 5 most recent interactions, builds a
 * `generateFollowUpPrompt`, calls the chat provider 3 times for variation
 * drafts, persists each as a FollowUpDraft row, and returns the drafts.
 *
 * If the contact has no prior interactions, the prompt still works (the
 * "no prior interactions logged" sentinel is rendered), so the user can
 * generate a cold outreach draft.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateDrafts, type FollowUpContact, type FollowUpInteraction } from '@/lib/ai'
import { isTonePreset } from '@/lib/tone-presets'

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

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const body = await req.json().catch(() => ({}))
    const tonePreset = typeof body?.tonePreset === 'string' ? body.tonePreset : 'casual'
    if (!isTonePreset(tonePreset)) {
      return NextResponse.json({ error: `unknown tonePreset: ${tonePreset}` }, { status: 400 })
    }
    const count = typeof body?.count === 'number' && body.count >= 1 && body.count <= 5 ? body.count : 3

    const contact = await db.contact.findUnique({
      where: { id },
      include: {
        interactions: { orderBy: { occurredAt: 'desc' }, take: 5 },
      },
    })
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const fuContact: FollowUpContact = {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      role: contact.role,
      notes: contact.notes,
      tags: parseTags(contact.tags),
    }
    // interactions come back newest-first; reverse so the prompt shows oldest -> newest
    const recentInteractions: FollowUpInteraction[] = contact.interactions
      .slice()
      .reverse()
      .map((i) => ({
        id: i.id,
        type: i.type,
        summary: i.summary,
        occurredAt: i.occurredAt,
      }))

    const draftContents = await generateDrafts(fuContact, recentInteractions, tonePreset, count)

    const drafts = []
    for (const content of draftContents) {
      const d = await db.followUpDraft.create({
        data: { contactId: id, tonePreset, content },
      })
      drafts.push({
        id: d.id,
        contactId: d.contactId,
        tonePreset: d.tonePreset,
        content: d.content,
        createdAt: d.createdAt.toISOString(),
      })
    }
    return NextResponse.json({ drafts })
  } catch (e) {
    console.error('[api/contacts/:id/follow-up POST] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
