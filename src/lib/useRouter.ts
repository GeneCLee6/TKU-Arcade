// The router's hooks and what its components share (src/lib/router.tsx has the components).
import { createContext, useContext } from 'react'

export interface Location {
  pathname: string
  search: string
  hash: string
}

export interface NavigateOptions {
  replace?: boolean
}

export type Navigate = (to: string, options?: NavigateOptions) => void

export interface RouterValue {
  location: Location
  navigate: Navigate
}

export const RouterContext = createContext<RouterValue | null>(null)
export const ParamsContext = createContext<Readonly<Record<string, string>>>({})

export function useRouter(): RouterValue {
  const router = useContext(RouterContext)
  if (!router) throw new Error('A router hook was used outside a router')
  return router
}

/** Where the page is: path, `?` query and `#` fragment */
export const useLocation = (): Location => useRouter().location

/** Goes to a path inside the site, adding a history entry unless `replace` */
export const useNavigate = (): Navigate => useRouter().navigate

/** The `:name` segments of the route that matched, decoded */
export const useParams = (): Readonly<Partial<Record<string, string>>> => useContext(ParamsContext)

/** Splits `/r/abc?x=1#y` into its parts */
export function parsePath(path: string): Location {
  const hashAt = path.indexOf('#')
  const hash = hashAt < 0 ? '' : path.slice(hashAt)
  const rest = hashAt < 0 ? path : path.slice(0, hashAt)
  const searchAt = rest.indexOf('?')
  return {
    pathname: (searchAt < 0 ? rest : rest.slice(0, searchAt)) || '/',
    search: searchAt < 0 ? '' : rest.slice(searchAt),
    hash: hash === '#' ? '' : hash,
  }
}

export const createPath = ({ pathname, search, hash }: Location): string =>
  pathname + search + hash

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * The params of `pathname` under `pattern` (`/r/:id`), or null when it does not match. As in
 * react-router: any case, any number of trailing slashes, `:name` is one whole segment
 */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const names: string[] = []
  const source = pattern
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (!segment.startsWith(':')) return `\\/${escapeRegExp(segment)}`
      names.push(segment.slice(1))
      return '\\/([^\\/]+)'
    })
    .join('')
  const found = new RegExp(`^${source}\\/*$`, 'i').exec(pathname)
  if (!found) return null
  return Object.fromEntries(names.map((name, at) => [name, decode(found[at + 1] ?? '')]))
}
