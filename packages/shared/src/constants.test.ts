import { describe, it, expect } from 'vitest'
import { DEFAULT_AI_ENDPOINT, DEFAULT_SERVER_PORT, DB_FILENAME, APP_NAME, APP_VERSION } from './constants'

describe('constants', () => {
  it('DEFAULT_AI_ENDPOINT is localhost:8080', () => {
    expect(DEFAULT_AI_ENDPOINT).toBe('http://localhost:8080')
  })

  it('DEFAULT_SERVER_PORT is 9090', () => {
    expect(DEFAULT_SERVER_PORT).toBe(9090)
  })

  it('DB_FILENAME is sahayak.db', () => {
    expect(DB_FILENAME).toBe('sahayak.db')
  })

  it('APP_NAME is Sahayak', () => {
    expect(APP_NAME).toBe('Sahayak')
  })

  it('APP_VERSION is 0.1.0', () => {
    expect(APP_VERSION).toBe('0.1.0')
  })
})
