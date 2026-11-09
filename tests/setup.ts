import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { resetAccountForTests } from '../src/lib/account.ts'

// The default 1 s is too short for a lazy page's first import on a busy machine; below the 5 s of a
// test, so that a real miss still reports what it was looking for
configure({ asyncUtilTimeout: 4_000 })

// Pages render as for a guest on a site without sign-in, and never ask /api/me, unless a test
// (tests/lib/account.test.tsx) says otherwise
beforeEach(() => {
  resetAccountForTests({ configured: false, account: null })
})

afterEach(() => {
  cleanup()
})
