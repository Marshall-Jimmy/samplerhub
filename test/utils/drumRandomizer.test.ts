import { describe, it, expect } from 'vitest'
import { randomizeTrack, randomizeLoopTrack, randomizePattern } from '@/utils/drumRandomizer'

describe('drumRandomizer', () => {
  describe('randomizeTrack', () => {
    it('should return array of correct length', () => {
      const result = randomizeTrack('kick', 16)
      expect(result).toHaveLength(16)
      expect(result.every(v => typeof v === 'boolean')).toBe(true)
    })

    it('should always hit mustHit positions for kick', () => {
      // Run many times to catch probabilistic failures
      for (let i = 0; i < 50; i++) {
        const result = randomizeTrack('kick', 16)
        expect(result[0]).toBe(true) // kick mustHit: [0]
      }
    })

    it('should support 8 steps', () => {
      const result = randomizeTrack('snare', 8)
      expect(result).toHaveLength(8)
    })

    it('should support 32 steps', () => {
      const result = randomizeTrack('hihat', 32)
      expect(result).toHaveLength(32)
    })

    it('should handle unknown track types gracefully', () => {
      const result = randomizeTrack('unknown-synth', 16)
      expect(result).toHaveLength(16)
      expect(result.every(v => typeof v === 'boolean')).toBe(true)
    })

    it('should produce denser patterns for hihat than crash', () => {
      const hihatRuns = Array.from({ length: 20 }, () =>
        randomizeTrack('hihat', 16).filter(Boolean).length
      )
      const crashRuns = Array.from({ length: 20 }, () =>
        randomizeTrack('crash', 16).filter(Boolean).length
      )
      const avgHihat = hihatRuns.reduce((a, b) => a + b, 0) / 20
      const avgCrash = crashRuns.reduce((a, b) => a + b, 0) / 20
      expect(avgHihat).toBeGreaterThan(avgCrash)
    })
  })

  describe('randomizeLoopTrack', () => {
    it('should only activate step 0', () => {
      const result = randomizeLoopTrack(16)
      expect(result).toHaveLength(16)
      expect(result[0]).toBe(true)
      expect(result.slice(1).every(v => v === false)).toBe(true)
    })

    it('should work with different step counts', () => {
      for (const steps of [8, 16, 32]) {
        const result = randomizeLoopTrack(steps)
        expect(result).toHaveLength(steps)
        expect(result[0]).toBe(true)
      }
    })
  })

  describe('randomizePattern', () => {
    it('should generate pattern for all tracks', () => {
      const tracks = [
        { id: 'kick-1', type: 'drum' },
        { id: 'snare-1', type: 'drum' },
        { id: 'hihat-1', type: 'drum' },
      ]
      const pattern = randomizePattern(tracks)
      expect(Object.keys(pattern)).toEqual(['kick-1', 'snare-1', 'hihat-1'])
      expect(pattern['kick-1']).toHaveLength(16)
    })

    it('should use loop logic for loop tracks', () => {
      const tracks = [
        { id: 'loop-1', type: 'loop', stepCount: 16 },
      ]
      const pattern = randomizePattern(tracks)
      expect(pattern['loop-1'][0]).toBe(true)
      expect(pattern['loop-1'].slice(1).every(v => v === false)).toBe(true)
    })

    it('should respect custom stepCount', () => {
      const tracks = [
        { id: 'tom-1', type: 'drum', stepCount: 32 },
      ]
      const pattern = randomizePattern(tracks)
      expect(pattern['tom-1']).toHaveLength(32)
    })

    it('should handle empty track list', () => {
      const pattern = randomizePattern([])
      expect(Object.keys(pattern)).toHaveLength(0)
    })
  })
})
