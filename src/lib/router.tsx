// The site's router: the few pieces of react-router-dom it used (BrowserRouter, Routes, Route, Link,
// and MemoryRouter for tests; the hooks are in useRouter.ts), with the same behaviour for how they
// are used here. react-router-dom cost about 12 kB gzip of every first load (D4, docs/NEXT.md);
// this is well under 1 kB. What it does the same way as react-router-dom 7:
//
// - a path matches without regard to case and with any number of trailing slashes; `:name` takes
//   one segment, decoded; `*` is the fallback whatever its place among the routes;
// - a navigation updates in a transition, so a lazy page keeps the old one on screen while it loads
//   instead of flashing the Suspense fallback;
// - a link handles only a plain left click without a target, and a link to where you are replaces
//   the history entry instead of adding one.
import {
  Children,
  isValidElement,
  startTransition,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import {
  createPath,
  matchPath,
  ParamsContext,
  parsePath,
  RouterContext,
  useLocation,
  useRouter,
  type Location,
  type Navigate,
} from './useRouter.ts'

const readWindow = (): Location => {
  const { pathname, search, hash } = window.location
  return { pathname, search, hash }
}

/** The address bar's router */
export function BrowserRouter({ children }: { children?: ReactNode }) {
  const [location, setLocation] = useState(readWindow)

  useLayoutEffect(() => {
    const onPop = () => startTransition(() => setLocation(readWindow()))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback<Navigate>((to, options) => {
    try {
      if (options?.replace) window.history.replaceState(null, '', to)
      else window.history.pushState(null, '', to)
    } catch {
      // Safari limits how many entries a page may push; the browser can still go there itself
      window.location.assign(to)
      return
    }
    startTransition(() => setLocation(readWindow()))
  }, [])

  const value = useMemo(() => ({ location, navigate }), [location, navigate])
  return <RouterContext value={value}>{children}</RouterContext>
}

/** A router with its history in memory, for tests */
export function MemoryRouter({
  initialEntries = ['/'],
  children,
}: {
  initialEntries?: readonly string[]
  children?: ReactNode
}) {
  const [history, setHistory] = useState(() => ({
    entries: initialEntries.length > 0 ? [...initialEntries] : ['/'],
    index: Math.max(initialEntries.length - 1, 0),
  }))

  const navigate = useCallback<Navigate>((to, options) => {
    startTransition(() =>
      setHistory(({ entries, index }) =>
        options?.replace
          ? { entries: entries.map((entry, at) => (at === index ? to : entry)), index }
          : { entries: [...entries.slice(0, index + 1), to], index: index + 1 },
      ),
    )
  }, [])

  const path = history.entries[history.index] ?? '/'
  const location = useMemo(() => parsePath(path), [path])
  const value = useMemo(() => ({ location, navigate }), [location, navigate])
  return <RouterContext value={value}>{children}</RouterContext>
}

interface RouteProps {
  path: string
  element: ReactNode
}

/** One route of `Routes`; it draws nothing itself */
export function Route(_props: RouteProps): null {
  return null
}

/** Draws the first route whose path matches the address, or the `*` route if none does */
export function Routes({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation()
  const routes = Children.toArray(children).filter(
    (child): child is ReactElement<RouteProps> => isValidElement(child) && child.type === Route,
  )
  let element: ReactNode = null
  let params: Record<string, string> | null = null
  for (const route of routes) {
    if (route.props.path === '*') continue
    params = matchPath(route.props.path, pathname)
    if (params) {
      element = route.props.element
      break
    }
  }
  if (!params) {
    const fallback = routes.find((route) => route.props.path === '*')
    if (!fallback) return null
    params = {}
    element = fallback.props.element
  }
  return <ParamsContext value={params}>{element}</ParamsContext>
}

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string
  ref?: Ref<HTMLAnchorElement>
}

const isModified = (event: MouseEvent) =>
  event.metaKey || event.altKey || event.ctrlKey || event.shiftKey

/** A link inside the site: a real `<a href>` that a plain click follows without reloading */
export function Link({ to, onClick, target, ...rest }: LinkProps) {
  const { location, navigate } = useRouter()
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || (target && target !== '_self')) return
    if (isModified(event)) return
    event.preventDefault()
    navigate(to, { replace: createPath(location) === createPath(parsePath(to)) })
  }
  return <a {...rest} href={to} target={target} onClick={handleClick} />
}
