/**
 * POST /api/contacts/[id]/recap — body `{ useLLM?: boolean }`.
 *
 * Always returns the pure-function keyword + summary recap from
 * `summarizeInteractions`. When `useLLM` is true, additionally:
 *   1. chunk the contact's interactions by date
 *   2. hybrid-retrieve the most relevant date-chunks for the contact's
 *      profile (name + role + company + tags + notes)
 *   3. call the chat provider with those chunks as grounding context
 *   4. attach the resulting narrative to the response
 *
 * The `source` field is "pure" or "llm" so the UI can show which path ran.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { summarizeInteractions, retrieveRelevantChunks, type RecapInteraction } from '@/lib/recap'
import { getChatProvider } from '@/lib/ai'

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
    const useLLM = !!body?.useLLM

    const contact = await db.contact.findUnique({
      where: { id },
      include: { interactions: { orderBy: { occurredAt: 'desc' } } },
    })
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

    const interactions: RecapInteraction[] = contact.interactions.map((i) => ({
      id: i.id,
      type: i.type,
      summary: i.summary,
      occurredAt: i.occurredAt,
    }))

    const pure = summarizeInteractions(interactions, 5)

    if (!useLLM) {
      return NextResponse.json({ ...pure, source: 'pure' })
    }

    // Build a retrieval query from the contact's profile so the hybrid search
    // surfaces the interactions most relevant to this person's role/context.
    const queryParts = [
      contact.name,
      contact.role,
      contact.company,
      parseTags(contact.tags).join(' '),
      contact.notes,
    ].filter(Boolean)
    const query = queryParts.join(' ')

    let narrative = ''
    try {
      const chunks = await retrieveRelevantChunks(interactions, query, 5)
      const context = chunks.length
        ? chunks.map((c) => `On ${c.date} (${c.count} interaction${c.count === 1 ? '' : 's'}):\n${c.text}`).join('\n\n')
        : '(no interactions logged)'

      const provider = getChatProvider()
      narrative = await provider.complete({
        systemPrompt:
          'You are a helpful assistant that writes a concise "last talked about" recap for a personal CRM. ' +
          'Ground every claim in the provided interaction context. Be concrete and specific — name topics, ' +
          'projects, or decisions that were discussed. 2-3 sentences. Plain text, no markdown, no preamble.',
        messages: [
          {
            role: 'user',
            content:
              `Contact: ${contact.name}.\n\n` +
              `Interaction context (most relevant days, oldest first):\n${context}\n\n` +
              `Write the recap now.`,
          },
        ],
      })
      narrative = narrative.trim()
    } catch (e) {
      console.warn('[recap] LLM narrative failed:', (e as Error).message)
      narrative = ''
    }

    return NextResponse.json({
      ...pure,
      narrative: narrative || undefined,
      source: 'llm',
    })
  } catch (e) {
    console.error('[api/contacts/:id/recap POST] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
