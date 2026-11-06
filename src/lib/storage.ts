// localStorage that never throws: reaching it can fail outright (blocked site data, sandboxed
// frames) and writing can fail when full. Callers then simply keep their choice in memory.
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // The choice lasts until the page closes
  }
}

export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing was stored, or nothing can be
  }
}
