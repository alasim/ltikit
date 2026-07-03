import { describe, it, expect } from 'vitest'
import { version } from './index'

describe('@ltikit/core', () => {
  it('exports a version string', () => {
    expect(typeof version).toBe('string')
  })
})
