/**
 * Tone presets for follow-up draft generation.
 *
 * Each preset bundles:
 *  - a `systemPrompt` that instructs the model on register, length, and
 *    constraints (passed to the LLM as the system message), and
 *  - a single `example` that demonstrates the register in one short message
 *    (passed in the user prompt as a "match this register" anchor).
 *
 * The example is a fully-written sample — NOT a template — so the model
 * learns the tone rather than copy-pasting structure.
 */

export interface TonePreset {
  id: string
  label: string
  description: string
  systemPrompt: string
  example: string
}

export const TONE_PRESETS: Record<string, TonePreset> = {
  casual: {
    id: 'casual',
    label: 'Casual',
    description: 'Friendly, relaxed, like texting someone you know well.',
    systemPrompt:
      'You are a warm, casual writing assistant that drafts follow-up messages for a personal CRM. ' +
      'Write the way someone texts a friend they know well: contractions are fine, keep it light and brief, ' +
      'no corporate jargon, no buzzwords, no exclamation overload. Open with something specific from the last ' +
      'interaction. 2-4 sentences. Plain text, no markdown.',
    example:
      'Hey Sam — really enjoyed yesterday\'s chat about the hiring plan. Your point about senior-vs-junior balance stuck with me. Coffee sometime next week?',
  },
  formal: {
    id: 'formal',
    label: 'Formal',
    description: 'Polished, professional, suitable for senior business contacts.',
    systemPrompt:
      'You are a professional writing assistant that drafts follow-up messages for a personal CRM. ' +
      'Write in a polished register suitable for a senior business context: complete sentences, polite framing, ' +
      'respectful greeting and sign-off, no contractions, no slang. Reference a concrete point from the last ' +
      'interaction. 3-5 sentences. Plain text, no markdown.',
    example:
      'Dear Ms. Chen, thank you for your time yesterday. I appreciated our discussion of the Q3 roadmap, ' +
      'particularly your framing of the dependency risk. I will follow up next week with the revised timeline. ' +
      'Best regards.',
  },
  warm: {
    id: 'warm',
    label: 'Warm',
    description: 'Sincere and personal without being overly familiar.',
    systemPrompt:
      'You are a sincere writing assistant that drafts follow-up messages for a personal CRM. ' +
      'Write in a register that feels personal and warm without crossing into overly familiar territory. ' +
      'Acknowledge one specific detail from the last conversation by name. Be genuine, not performative. ' +
      '2-4 sentences. Plain text, no markdown.',
    example:
      'Hi Jordan — I keep thinking about what you said on Tuesday about burnout. Thank you for being honest ' +
      'about it; that is not the kind of thing people say lightly. Would a walk this weekend work?',
  },
}

export const DEFAULT_TONE = 'casual'

export function getTonePreset(id: string): TonePreset {
  return TONE_PRESETS[id] ?? TONE_PRESETS[DEFAULT_TONE]
}

export function listTonePresets(): TonePreset[] {
  return Object.values(TONE_PRESETS)
}

export function isTonePreset(id: string): boolean {
  return id in TONE_PRESETS
}
