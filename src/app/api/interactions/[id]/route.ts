/**
 * DELETE /api/interactions/[id] — remove a single interaction.
 *
 * Deleting the interaction does NOT bump the parent contact's updatedAt
 * (deletion is a maintenance action, not a "this contact just became more
 * active" signal). The client re-fetches the interaction list + alerts after
 * a successful delete.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const existing = await db.interaction.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Interaction not found' }, { status: 404 })
    await db.interaction.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/interactions/:id DELETE] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
