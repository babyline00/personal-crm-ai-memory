import { test, expect, describe } from 'bun:test'
import {
  TONE_PRESETS,
  getTonePreset,
  listTonePresets,
  isTonePreset,
  DEFAULT_TONE,
} from '../tone-presets'

describe('TONE_PRESETS', () => {
  test('every preset has a non-empty systemPrompt', () => {
    for (const preset of listTonePresets()) {
      expect(preset.systemPrompt).toBeTruthy()
      expect(preset.systemPrompt.length).toBeGreaterThan(40)
    }
  })
  test('every preset has a non-empty example', () => {
    for (const preset of listTonePresets()) {
      expect(preset.example).toBeTruthy()
      expect(preset.example.length).toBeGreaterThan(20)
    }
  })
  test('every preset has id matching its key', () => {
    for (const [key, preset] of Object.entries(TONE_PRESETS)) {
      expect(preset.id).toBe(key)
    }
  })
  test('the three spec\'d presets exist: casual, formal, warm', () => {
    expect(TONE_PRESETS.casual).toBeDefined()
    expect(TONE_PRESETS.formal).toBeDefined()
    expect(TONE_PRESETS.warm).toBeDefined()
  })
  test('each preset has a label and description', () => {
    for (const preset of listTonePresets()) {
      expect(preset.label).toBeTruthy()
      expect(preset.description).toBeTruthy()
    }
  })
})

describe('getTonePreset', () => {
  test('returns the requested preset', () => {
    expect(getTonePreset('formal').id).toBe('formal')
    expect(getTonePreset('warm').id).toBe('warm')
  })
  test('falls back to DEFAULT_TONE for unknown id', () => {
    expect(getTonePreset('does-not-exist').id).toBe(DEFAULT_TONE)
  })
  test('falls back to casual for empty string', () => {
    expect(getTonePreset('').id).toBe('casual')
  })
})

describe('listTonePresets', () => {
  test('returns all presets', () => {
    const list = listTonePresets()
    expect(list.length).toBe(Object.keys(TONE_PRESETS).length)
    expect(list.length).toBeGreaterThanOrEqual(3)
  })
})

describe('isTonePreset', () => {
  test('true for known presets', () => {
    expect(isTonePreset('casual')).toBe(true)
    expect(isTonePreset('formal')).toBe(true)
    expect(isTonePreset('warm')).toBe(true)
  })
  test('false for unknown preset', () => {
    expect(isTonePreset('robot')).toBe(false)
    expect(isTonePreset('')).toBe(false)
  })
})
