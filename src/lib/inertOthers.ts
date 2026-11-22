/**
 * Makes everything on the page inert except `keep` and what is marked `data-inert-keep` (the toasts,
 * the update prompt, the reactions' live region), as a modal does: no tab stop, no click, nothing for
 * a screen reader outside them. Walks up from each kept element and marks the siblings off its path,
 * so that a kept element deep in the page stays usable without its ancestors; what the page adds
 * beside that path meanwhile (a banner, a portal) is marked as it comes. Returns the undo, which
 * leaves an element that was inert already as it was.
 */
const KEEP = '[data-inert-keep]'

export function inertOthers(keep: readonly Element[]): () => void {
  const kept = [...keep, ...document.querySelectorAll(KEEP)]
  const onPath = new Set<Element>()
  for (const element of kept) {
    for (let at: Element | null = element; at !== null && at !== document.documentElement; at = at.parentElement) {
      onPath.add(at)
    }
  }
  const marked: HTMLElement[] = []
  const mark = (child: Node) => {
    if (onPath.has(child as Element) || !(child instanceof HTMLElement) || child.hasAttribute('inert')) return
    // Nothing to reach in these
    if (child instanceof HTMLScriptElement || child instanceof HTMLStyleElement) return
    // One that comes later and is to stay (the update prompt), or holds one
    if (child.matches(KEEP) || child.querySelector(KEEP) !== null) return
    child.setAttribute('inert', '')
    marked.push(child)
  }
  // The parents whose children are sorted: on a path, and not inside a kept element (all of which stays)
  const parents = [...onPath].filter((element) => !kept.some((one) => one.contains(element)))
  const observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(mark)
  })
  for (const parent of parents) {
    for (const child of parent.children) mark(child)
    observer.observe(parent, { childList: true })
  }
  return () => {
    observer.disconnect()
    for (const element of marked) element.removeAttribute('inert')
  }
}
