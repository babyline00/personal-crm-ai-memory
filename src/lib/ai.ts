/**
 * AI follow-up drafts.
 *
 * Adapted from the parent project's streaming RAG chat layer, but trimmed to
 * the non-streaming `complete()` shape that follow-up-draft generation needs
 * (we want 2-3 full draft variations, not a token stream).
 *
 * The interface `ChatProvider` has a single async `complete()` method.
 * `ZaiProvider` implements it against the z-ai-web-dev-sdk. `MockProvider` is
 * a deterministic fallback so the UI stays demoable offline and unit tests can
 * assert prompt shape without hitting a network.
 *
 * `generateFollowUpPrompt(contact, recentInteractions, tonePreset)` builds
 * the { systemPrompt, userPrompt } pair from the contact's profile + the most
 * recent interactions + the tone preset's system instructions and example.
 *
 * `generateDrafts(...)` calls the provider `count` times (default 3) with a
 * per-call variation suffix so the model produces meaningfully different
 * drafts each time.
 */

import { getTonePreset } from './tone-presets'

export interface FollowUpContact {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  company?: string | null
  role?: string | null
  notes?: string | null
  tags: string[]
}

export interface FollowUpInteraction {
  id: string
  type: string
  summary: string
  occurredAt: Date | string
}

export interface ChatProvider {
  complete(args: {
    systemPrompt: string
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  }): Promise<string>
}

let cachedProvider: ChatProvider | null = null

class ZaiProvider implements ChatProvider {
  async complete(args: {
    systemPrompt: string
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  }): Promise<string> {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const messages = [
      { role: 'system' as const, content: args.systemPrompt },
      ...args.messages,
    ]
    const completion = await zai.chat.completions.create({
      messages,
      stream: false,
      thinking: { type: 'disabled' },
    })
    if (typeof completion === 'string') return completion
    const content = (completion as any)?.choices?.[0]?.message?.content
    return typeof content === 'string' ? content : ''
  }
}

class MockProvider implements ChatProvider {
  async complete(args: {
    systemPrompt: string
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  }): Promise<string> {
    const lastUser = [...args.messages].reverse().find((m) => m.role === 'user')
    const text = lastUser?.content ?? ''
    const firstLine = text.split('\n').find((l) => l.startsWith('Contact:')) ?? ''
    const toneTag = args.systemPrompt.split('\n')[0].slice(0, 24)
    return `[mock draft | ${toneTag}] ${firstLine}. (No live LLM configured — set the SDK config to enable real drafts.)`
  }
}

export function getChatProvider(): ChatProvider {
  if (cachedProvider) return cachedProvider
  if (process.env.CRM_DISABLE_LLM === '1') {
    cachedProvider = new MockProvider()
    return cachedProvider
  }
  try {
    cachedProvider = new ZaiProvider()
  } catch (e) {
    console.warn('[ai] ZaiProvider unavailable, using MockProvider:', (e as Error).message)
    cachedProvider = new MockProvider()
  }
  return cachedProvider
}

/** Test-only. */
export function __setChatProviderForTest(p: ChatProvider | null) {
  cachedProvider = p
}

/**
 * Build the { systemPrompt, userPrompt } pair for a follow-up draft. The
 * system prompt comes from the tone preset; the user prompt carries the
 * contact profile + recent interactions + tone example + write instruction.
 *
 * Pure function — no IO, no provider calls. Safe to unit-test directly.
 */
export function generateFollowUpPrompt(
  contact: FollowUpContact,
  recentInteractions: FollowUpInteraction[],
  tonePreset: string,
): { systemPrompt: string; userPrompt: string } {
  const tone = getTonePreset(tonePreset)
  const systemPrompt = tone.systemPrompt

  const lines = [
    `Contact: ${contact.name}`,
    contact.email ? `Email: ${contact.email}` : null,
    contact.phone ? `Phone: ${contact.phone}` : null,
    contact.company ? `Company: ${contact.company}` : null,
    contact.role ? `Role: ${contact.role}` : null,
    contact.tags.length ? `Tags: ${contact.tags.join(', ')}` : null,
    contact.notes ? `Notes: ${contact.notes}` : null,
  ].filter(Boolean)

  const interactionLines = recentInteractions.length
    ? recentInteractions.map((i) => {
        const d = i.occurredAt instanceof Date ? i.occurredAt : new Date(i.occurredAt)
        const dateStr = isNaN(d.getTime()) ? '?' : d.toISOString().slice(0, 10)
        return `- [${i.type}] ${dateStr}: ${i.summary}`
      })
    : ['- (no prior interactions logged)']

  const userPrompt = [
    'Write a short follow-up message to the contact below.',
    `Tone: ${tone.id} (${tone.label}).`,
    '',
    'CONTACT PROFILE:',
    ...lines,
    '',
    'RECENT INTERACTIONS (most recent last):',
    ...interactionLines,
    '',
    'TONE EXAMPLE (match this register, not its content):',
    tone.example,
    '',
    'Now write the follow-up. Keep it 2-4 sentences. Do NOT use placeholders like [Name] — use the actual contact name.',
  ].join('\n')

  return { systemPrompt, userPrompt }
}

/**
 * Generate `count` (default 3) draft variations by calling the provider once
 * per variation with an index suffix that nudges the model to produce a
 * meaningfully different draft each call.
 */
export async function generateDrafts(
  contact: FollowUpContact,
  recentInteractions: FollowUpInteraction[],
  tonePreset: string,
  count = 3,
): Promise<string[]> {
  const provider = getChatProvider()
  const { systemPrompt, userPrompt } = generateFollowUpPrompt(
    contact,
    recentInteractions,
    tonePreset,
  )
  const drafts: string[] = []
  for (let i = 0; i < count; i++) {
    const variation = await provider.complete({
      systemPrompt,
      messages: [
        {
          role: 'user',
          content:
            `${userPrompt}\n\n` +
            `(Write variation #${i + 1} of ${count}. ` +
            `Make each variation meaningfully different — different opening, different length, different angle.)`,
        },
      ],
    })
    drafts.push(variation.trim())
  }
  return drafts.filter((d) => d.length > 0)
}
