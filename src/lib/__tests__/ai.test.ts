import { test, expect, describe } from 'bun:test'
import {
  generateFollowUpPrompt,
  generateDrafts,
  getChatProvider,
  __setChatProviderForTest,
  type ChatProvider,
  type FollowUpContact,
  type FollowUpInteraction,
} from '../ai'
import { TONE_PRESETS } from '../tone-presets'

const contact: FollowUpContact = {
  id: 'c1',
  name: 'Sam Rivera',
  email: 'sam@acme.io',
  phone: '+1 555 0100',
  company: 'Acme',
  role: 'VP Engineering',
  tags: ['investor', 'advisor'],
  notes: 'Met at SaaStr. Loves cycling.',
}

const interactions: FollowUpInteraction[] = [
  {
    id: 'i1',
    type: 'meeting',
    summary: 'Discussed Q3 hiring plan and the senior-vs-junior balance.',
    occurredAt: new Date('2026-01-10T15:00:00Z'),
  },
  {
    id: 'i2',
    type: 'call',
    summary: 'Quick call about the roadmap dependency risk.',
    occurredAt: new Date('2026-02-02T18:00:00Z'),
  },
]

describe('generateFollowUpPrompt', () => {
  test('includes contact name + email + company + role + tags + notes', () => {
    const { userPrompt } = generateFollowUpPrompt(contact, interactions, 'casual')
    expect(userPrompt).toContain('Sam Rivera')
    expect(userPrompt).toContain('sam@acme.io')
    expect(userPrompt).toContain('Acme')
    expect(userPrompt).toContain('VP Engineering')
    expect(userPrompt).toContain('investor')
    expect(userPrompt).toContain('advisor')
    expect(userPrompt).toContain('Met at SaaStr')
  })
  test('includes each recent interaction summary', () => {
    const { userPrompt } = generateFollowUpPrompt(contact, interactions, 'formal')
    expect(userPrompt).toContain('Q3 hiring plan')
    expect(userPrompt).toContain('roadmap dependency risk')
  })
  test('systemPrompt comes from the tone preset', () => {
    const { systemPrompt } = generateFollowUpPrompt(contact, interactions, 'warm')
    expect(systemPrompt).toBe(TONE_PRESETS.warm.systemPrompt)
  })
  test('unknown tone falls back to default (casual)', () => {
    const { systemPrompt } = generateFollowUpPrompt(contact, interactions, 'does-not-exist')
    expect(systemPrompt).toBe(TONE_PRESETS.casual.systemPrompt)
  })
  test('includes the tone example as a register anchor', () => {
    const { userPrompt } = generateFollowUpPrompt(contact, interactions, 'casual')
    expect(userPrompt).toContain(TONE_PRESETS.casual.example)
  })
  test('handles contact with no interactions', () => {
    const { userPrompt } = generateFollowUpPrompt(
      { ...contact, notes: null, email: null, company: null, role: null, phone: null, tags: [] },
      [],
      'casual',
    )
    expect(userPrompt).toContain('no prior interactions logged')
    expect(userPrompt).not.toContain('Email:')
    expect(userPrompt).not.toContain('Company:')
  })
  test('omits empty optional fields (no "Email: null" line)', () => {
    const { userPrompt } = generateFollowUpPrompt(
      { id: 'c2', name: 'Pat', tags: [] },
      [],
      'casual',
    )
    expect(userPrompt).not.toContain('Email:')
    expect(userPrompt).not.toContain('Company:')
    expect(userPrompt).not.toContain('Tags:')
    expect(userPrompt).toContain('Pat')
  })
})

describe('generateDrafts (mock provider)', () => {
  class CountingMock implements ChatProvider {
    calls = 0
    async complete(args: {
      systemPrompt: string
      messages: { role: string; content: string }[]
    }): Promise<string> {
      this.calls += 1
      const last = [...args.messages].reverse().find((m) => m.role === 'user')
      return `draft ${this.calls}: ${last?.content.slice(0, 30) ?? ''}`
    }
  }
  test('calls the provider once per requested draft', async () => {
    const mock = new CountingMock()
    __setChatProviderForTest(mock)
    const drafts = await generateDrafts(contact, interactions, 'casual', 3)
    expect(drafts.length).toBe(3)
    expect(mock.calls).toBe(3)
    expect(drafts[0]).toContain('draft 1')
    expect(drafts[2]).toContain('draft 3')
    __setChatProviderForTest(null)
  })
  test('default count is 3', async () => {
    const mock = new CountingMock()
    __setChatProviderForTest(mock)
    const drafts = await generateDrafts(contact, interactions, 'warm')
    expect(drafts.length).toBe(3)
    expect(mock.calls).toBe(3)
    __setChatProviderForTest(null)
  })
  test('each variation prompt is tagged with its variation number', async () => {
    const seen: string[] = []
    class InspectMock implements ChatProvider {
      async complete(args: {
        systemPrompt: string
        messages: { role: string; content: string }[]
      }): Promise<string> {
        const last = [...args.messages].reverse().find((m) => m.role === 'user')
        seen.push(last?.content ?? '')
        return 'ok'
      }
    }
    __setChatProviderForTest(new InspectMock())
    await generateDrafts(contact, interactions, 'formal', 2)
    expect(seen[0]).toContain('variation #1 of 2')
    expect(seen[1]).toContain('variation #2 of 2')
    __setChatProviderForTest(null)
  })
  test('empty drafts are filtered out', async () => {
    class EmptyMock implements ChatProvider {
      async complete(): Promise<string> {
        return '   '
      }
    }
    __setChatProviderForTest(new EmptyMock())
    const drafts = await generateDrafts(contact, interactions, 'casual', 3)
    expect(drafts).toEqual([])
    __setChatProviderForTest(null)
  })
  test('getChatProvider returns the mock when CRM_DISABLE_LLM=1', () => {
    const prev = process.env.CRM_DISABLE_LLM
    process.env.CRM_DISABLE_LLM = '1'
    __setChatProviderForTest(null)
    const p = getChatProvider()
    // mock provider returns a string with the "[mock draft" sentinel
    expect(p).toBeDefined()
    process.env.CRM_DISABLE_LLM = prev
    __setChatProviderForTest(null)
  })
})
