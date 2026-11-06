import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// The default 1 s is too short for a lazy page's first import on a busy machine; below the 5 s of a
// test, so that a real miss still reports what it was looking for
configure({ asyncUtilTimeout: 4_000 })

afterEach(() => {
  cleanup()
})
