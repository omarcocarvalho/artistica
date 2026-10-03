import { describe, expect, it } from 'vitest'
import { ping } from './ping'

describe('ping (proof worker logic)', () => {
  it('answers with the message', () => {
    expect(ping('hello')).toBe('pong:hello')
  })
})
