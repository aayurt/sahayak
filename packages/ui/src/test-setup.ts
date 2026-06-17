

// Mock crypto.randomUUID for deterministic IDs
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => '00000000-0000-0000-0000-000000000001' },
    writable: true,
  })
}
