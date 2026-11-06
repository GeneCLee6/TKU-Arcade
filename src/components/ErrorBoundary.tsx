import { Component, type ErrorInfo, type ReactNode } from 'react'
import styled from 'styled-components'
import { useT } from '../i18n/useT.ts'
import { isStaleChunkError, reloadForStaleChunk, reportClientError } from '../lib/errorReport.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'

interface ErrorBoundaryProps {
  children: ReactNode
  /** The route: going somewhere else tries again */
  resetKey: string
  /** Stands in for the browser's reload in tests */
  reload?: () => void
}

interface ErrorBoundaryState {
  error: unknown
  failed: boolean
  /** `resetKey` when it failed */
  failedAt: string | null
}

const reloadPage = () => window.location.reload()

/**
 * What a page shows instead of nothing when it throws or its lazy code cannot load. For a tab that
 * outlived a deploy the old chunk is gone, so one automatic reload fetches the new build.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, failed: false, failedAt: null }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error, failed: true }
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (!state.failed) return null
    if (state.failedAt === null) return { failedAt: props.resetKey }
    return state.failedAt === props.resetKey ? null : { error: null, failed: false, failedAt: null }
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    const stale = isStaleChunkError(error)
    reportClientError(stale ? 'chunk' : 'boundary', error)
    if (stale) reloadForStaleChunk(this.props.reload ?? reloadPage)
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return (
      <ErrorScreen
        stale={isStaleChunkError(this.state.error)}
        onReload={this.props.reload ?? reloadPage}
      />
    )
  }
}

function ErrorScreen({ stale, onReload }: { stale: boolean; onReload: () => void }) {
  const t = useT()
  return (
    <Box role="alert">
      <Title>{t(stale ? 'errorPage.staleTitle' : 'errorPage.title')}</Title>
      <Hint>{t(stale ? 'errorPage.staleHint' : 'errorPage.hint')}</Hint>
      <Actions>
        <Button onClick={onReload}>{t('errorPage.reload')}</Button>
        <Button $variant="secondary" onClick={() => window.location.assign('/')}>
          {t('errorPage.home')}
        </Button>
      </Actions>
    </Box>
  )
}

const Box = styled.main`
  display: grid;
  gap: ${space.md}px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: ${space.xl}px ${space.lg}px;
`

const Title = styled.h1`
  margin: 0;
  font-size: ${fontSize.xl}px;
`

const Hint = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`
