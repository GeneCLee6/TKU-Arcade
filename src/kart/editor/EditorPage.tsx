// e10-t07 (AC-10.5): the track editor, /kart/editor. Pieces from a library laid end to end (shared/
// kart/editor/), a live map of the road with whatever is wrong marked on it, a 3D look on demand,
// saves in this browser, and a link to share that opens the track on /kart. Its own lazy chunk: the
// lobby never loads it, and three.js comes only with the 3D view.
import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react'
import styled from 'styled-components'
import { buildSpec, type Problem } from '../../../shared/kart/editor/build.ts'
import { closeLoop } from '../../../shared/kart/editor/close.ts'
import { decodeSpec, encodeSpec } from '../../../shared/kart/editor/codec.ts'
import {
  BYPASS_FEATURES,
  BOOM_SPANS,
  LIMITS,
  PAD_PLACES,
  starterSpec,
  tenth,
  TRACK_THEMES,
  type BoomSpan,
  type Bypass,
  type PadPlace,
  type Piece,
  type TrackSpec,
  type TrackTheme,
} from '../../../shared/kart/editor/spec.ts'
import { KART_MESSAGES, type KartMessageKey } from '../../../shared/kart/i18n.ts'
import { KART_EDITOR_MESSAGES } from '../../../shared/kart/i18n.editor.ts'
import { Button } from '../../components/Button.tsx'
import { registerMessages, type MessageParams } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { Link } from '../../lib/router.tsx'
import { color, fontSize, radius, space } from '../../styles/tokens.ts'
import { codeInAddress, shareLink } from './link.ts'
import { MapView } from './MapView.tsx'
import { PRESETS } from './presets.ts'
import { deleteTrack, loadSaves, saveTrack, type SavedTrack } from './saves.ts'

registerMessages(KART_MESSAGES)
// This screen's own strings, in its own chunk: the menu and a race never load them (2026-11-22)
registerMessages(KART_EDITOR_MESSAGES)

const View3D = lazy(() => import('./View3D.tsx'))

type T = (key: KartMessageKey, params?: MessageParams) => string
type Panel = 'saves' | 'share' | null
type Notice = { key: KartMessageKey; params?: MessageParams } | null

/** How many changes Undo can take back */
const HISTORY = 50

/** The track the page opens with: the one in its address (`?custom=`), else the starter loop */
function firstSpec(): TrackSpec {
  const code = codeInAddress()
  return (code && decodeSpec(code)) || starterSpec()
}

/** One line for a piece in the list */
function pieceText(t: T, piece: Piece): string {
  if (piece.kind === 'straight') return t('kart.editor.piece.straight', { length: piece.length })
  if (piece.kind === 'slope') {
    return t(piece.rise > 0 ? 'kart.editor.piece.uphill' : 'kart.editor.piece.downhill', {
      length: piece.length,
      rise: Math.abs(piece.rise),
    })
  }
  if (piece.kind === 'jump') {
    return t('kart.editor.piece.jump', { length: piece.length, height: piece.height })
  }
  if (piece.kind === 'overpass') {
    return t(piece.rise > 0 ? 'kart.editor.piece.overpass' : 'kart.editor.piece.underpass', {
      length: piece.length,
      rise: Math.abs(piece.rise),
    })
  }
  if (piece.kind === 'boom') {
    const key =
      piece.span === 'left'
        ? 'kart.editor.piece.boomLeft'
        : piece.span === 'right'
          ? 'kart.editor.piece.boomRight'
          : 'kart.editor.piece.boom'
    return t(key, { length: piece.length, period: piece.period })
  }
  if (piece.kind === 'slider') {
    return t('kart.editor.piece.slider', { length: piece.length, period: piece.period })
  }
  if (piece.bank) {
    return t(piece.angle < 0 ? 'kart.editor.piece.bankedLeft' : 'kart.editor.piece.bankedRight', {
      angle: Math.abs(piece.angle),
      radius: piece.radius,
      bank: piece.bank,
    })
  }
  return t(piece.angle < 0 ? 'kart.editor.piece.left' : 'kart.editor.piece.right', {
    angle: Math.abs(piece.angle),
    radius: piece.radius,
  })
}

function problemText(t: T, problem: Problem): string {
  const text = t(`kart.editor.problem.${problem.code}`, problem.params)
  if (problem.pieces.length === 0) return text
  const pieces = problem.pieces.map((index) => index + 1).join(', ')
  return t(problem.pieces.length > 1 ? 'kart.editor.problemAt' : 'kart.editor.problemOne', {
    pieces,
    problem: text,
  })
}

export default function EditorPage() {
  const t: T = useT()
  const ids = useId()
  const [spec, setSpec] = useState<TrackSpec>(firstSpec)
  const [history, setHistory] = useState<TrackSpec[]>([])
  const [selected, setSelected] = useState(0)
  const [saveId, setSaveId] = useState<string | null>(null)
  const [saves, setSaves] = useState<readonly SavedTrack[]>(loadSaves)
  const [panel, setPanel] = useState<Panel>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [view, setView] = useState<'map' | '3d'>('map')
  const [overhead, setOverhead] = useState(false)
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)

  const built = useMemo(() => buildSpec(spec), [spec])
  const code = useMemo(() => encodeSpec(spec), [spec])
  const legal = built.problems.length === 0
  const faulty = useMemo(
    () => new Set(built.problems.flatMap((problem) => problem.pieces)),
    [built],
  )
  const piece = spec.pieces[Math.min(selected, spec.pieces.length - 1)]
  const at = Math.min(selected, spec.pieces.length - 1)

  /** Every change goes through here, so that Undo can take it back */
  const change = (next: TrackSpec, select?: number) => {
    setHistory((past) => [...past, spec].slice(-HISTORY))
    setSpec(next)
    if (select !== undefined) setSelected(select)
    setNotice(null)
    setCopied(null)
  }

  // 2026-11-20: a bypass whose pieces are gone, or that would end on the last piece, goes with them
  const setPieces = (pieces: Piece[], select?: number) => {
    const bypasses = (spec.bypasses ?? []).filter(
      (bypass) => bypass.to < pieces.length - 1 && bypass.from <= bypass.to,
    )
    change({ ...spec, pieces, bypasses: bypasses.length > 0 ? bypasses : undefined }, select)
  }
  const bypassAt = (spec.bypasses ?? []).findIndex((bypass) => bypass.from === at)
  const setBypasses = (bypasses: Bypass[]) =>
    change({ ...spec, bypasses: bypasses.length > 0 ? bypasses : undefined })
  const editBypass = (edit: Partial<Bypass>) =>
    setBypasses(
      (spec.bypasses ?? []).map((bypass, index) => (index === bypassAt ? { ...bypass, ...edit } : bypass)),
    )
  const editPiece = (index: number, edit: Partial<Piece>) =>
    setPieces(spec.pieces.map((one, i) => (i === index ? ({ ...one, ...edit } as Piece) : one)))

  const undo = () => {
    const last = history[history.length - 1]
    if (!last) return
    setHistory(history.slice(0, -1))
    setSpec(last)
    setSelected((index) => Math.min(index, last.pieces.length - 1))
    setNotice(null)
  }

  const addPieces = (added: Piece[]) => {
    if (spec.pieces.length + added.length > LIMITS.maxPieces) return
    const where = spec.pieces.length === 0 ? 0 : at + 1
    const pieces = [...spec.pieces.slice(0, where), ...added, ...spec.pieces.slice(where)]
    setPieces(pieces, where + added.length - 1)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= spec.pieces.length) return
    const pieces = [...spec.pieces]
    const [moved] = pieces.splice(from, 1)
    pieces.splice(to, 0, moved!)
    setPieces(pieces, to)
  }

  const remove = (index: number) => {
    if (spec.pieces.length <= 1) return
    setPieces(
      spec.pieces.filter((_, i) => i !== index),
      Math.max(0, index - 1),
    )
  }

  const close = () => {
    const added = closeLoop(spec)
    if (!added) {
      setNotice({ key: 'kart.editor.closeFailed' })
      return
    }
    change({ ...spec, pieces: [...spec.pieces, ...added] }, spec.pieces.length + added.length - 1)
    setNotice({ key: 'kart.editor.closed', params: { count: added.length } })
  }

  const save = () => {
    const id = saveTrack(spec, saveId)
    setSaveId(id)
    setSaves(loadSaves())
    setNotice({ key: 'kart.editor.saved' })
  }

  const open = (saved: SavedTrack) => {
    const opened = decodeSpec(saved.code)
    if (!opened) return
    change(opened, 0)
    setSaveId(saved.id)
    setPanel(null)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink(code))
      setCopied('yes')
    } catch {
      setCopied('no')
    }
  }

  // Escape closes the open panel
  useEffect(() => {
    if (!panel) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel])

  const width = piece?.width ?? 36

  return (
    <Page data-testid="kart-editor">
      <Top>
        <Link to="/kart">{t('kart.editor.back')}</Link>
        <Title>{t('kart.editor.title')}</Title>
        <Inline>
          <span>{t('kart.editor.name')}</span>
          <input
            value={spec.name}
            maxLength={LIMITS.maxName}
            placeholder={t('kart.editor.untitled')}
            onChange={(event) => setSpec({ ...spec, name: event.target.value })}
            onBlur={() => setSpec((current) => ({ ...current, name: current.name.trim() }))}
            data-testid="kart-editor-name"
          />
        </Inline>
        <Inline>
          <span>{t('kart.editor.theme')}</span>
          <select
            value={spec.theme}
            onChange={(event) => change({ ...spec, theme: event.target.value as TrackTheme })}
            data-testid="kart-editor-theme"
          >
            {TRACK_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {t(`kart.editor.theme.${theme}`)}
              </option>
            ))}
          </select>
        </Inline>
        <Actions>
          <Button
            $size="sm"
            $variant="secondary"
            onClick={() => {
              change(starterSpec(), 0)
              setSaveId(null)
            }}
          >
            {t('kart.editor.new')}
          </Button>
          <Button $size="sm" $variant="secondary" onClick={undo} disabled={history.length === 0}>
            {t('kart.editor.undo')}
          </Button>
          <Button $size="sm" $variant="secondary" onClick={close} data-testid="kart-editor-close">
            {t('kart.editor.close')}
          </Button>
          <Button $size="sm" $variant="secondary" onClick={save} data-testid="kart-editor-save">
            {t('kart.editor.save')}
          </Button>
          <Button
            $size="sm"
            $variant="secondary"
            aria-expanded={panel === 'saves'}
            onClick={() => setPanel(panel === 'saves' ? null : 'saves')}
            data-testid="kart-editor-saves"
          >
            {t('kart.editor.saves')}
          </Button>
          <Button
            $size="sm"
            $variant="secondary"
            aria-expanded={panel === 'share'}
            onClick={() => setPanel(panel === 'share' ? null : 'share')}
            disabled={!legal}
            data-testid="kart-editor-share"
          >
            {t('kart.editor.share')}
          </Button>
          {legal ? (
            <DriveLink to={`/kart?custom=${code}`} data-testid="kart-editor-drive">
              {t('kart.editor.drive')}
            </DriveLink>
          ) : (
            <Button $size="sm" disabled>
              {t('kart.editor.drive')}
            </Button>
          )}
        </Actions>
      </Top>

      {panel === 'share' && legal && (
        <Sheet aria-labelledby={`${ids}share`} data-testid="kart-editor-share-panel">
          <SheetTitle id={`${ids}share`}>{t('kart.editor.shareTitle')}</SheetTitle>
          <LinkBox
            readOnly
            value={shareLink(code)}
            onFocus={(event) => event.currentTarget.select()}
            aria-labelledby={`${ids}share`}
            data-testid="kart-editor-link"
          />
          <Note>{t('kart.editor.shareNote')}</Note>
          <Row>
            <Button $size="sm" onClick={() => void copy()} data-testid="kart-editor-copy">
              {t('kart.editor.copy')}
            </Button>
            <Button $size="sm" $variant="secondary" onClick={() => setPanel(null)}>
              {t('kart.editor.closePanel')}
            </Button>
            {copied && (
              <span role="status">
                {t(copied === 'yes' ? 'kart.editor.copied' : 'kart.editor.copyFailed')}
              </span>
            )}
          </Row>
        </Sheet>
      )}

      {panel === 'saves' && (
        <Sheet aria-labelledby={`${ids}saves`} data-testid="kart-editor-saves-panel">
          <SheetTitle id={`${ids}saves`}>{t('kart.editor.saves')}</SheetTitle>
          <Note>{t('kart.editor.savesNote')}</Note>
          {saves.length === 0 ? (
            <Note>{t('kart.editor.savesEmpty')}</Note>
          ) : (
            <SaveList>
              {saves.map((saved) => {
                const name = decodeSpec(saved.code)?.name || t('kart.editor.untitled')
                return (
                  <li key={saved.id}>
                    <span>{name}</span>
                    <Button
                      $size="sm"
                      $variant="secondary"
                      aria-label={t('kart.editor.loadNamed', { name })}
                      onClick={() => open(saved)}
                    >
                      {t('kart.editor.load')}
                    </Button>
                    <Button
                      $size="sm"
                      $variant="ghost"
                      aria-label={t('kart.editor.deleteNamed', { name })}
                      onClick={() => {
                        deleteTrack(saved.id)
                        if (saved.id === saveId) setSaveId(null)
                        setSaves(loadSaves())
                      }}
                    >
                      {t('kart.editor.delete')}
                    </Button>
                  </li>
                )
              })}
            </SaveList>
          )}
          <Row>
            <Button $size="sm" $variant="secondary" onClick={() => setPanel(null)}>
              {t('kart.editor.closePanel')}
            </Button>
          </Row>
        </Sheet>
      )}

      <Body>
        <Side>
          <Note>{t('kart.editor.rules')}</Note>
          <section aria-labelledby={`${ids}add`}>
            <SectionTitle id={`${ids}add`}>{t('kart.editor.add')}</SectionTitle>
            <Note>{t('kart.editor.addHint')}</Note>
            <Palette>
              {PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  $size="sm"
                  $variant="secondary"
                  disabled={spec.pieces.length >= LIMITS.maxPieces}
                  onClick={() => addPieces(preset.make(width))}
                  data-testid={`kart-editor-add-${preset.id}`}
                >
                  {t(preset.label)}
                </Button>
              ))}
            </Palette>
          </section>

          <section aria-labelledby={`${ids}pieces`}>
            <SectionTitle id={`${ids}pieces`}>
              {t('kart.editor.pieces', { count: spec.pieces.length })}
            </SectionTitle>
            <PieceList data-testid="kart-editor-pieces">
              {spec.pieces.map((one, index) => (
                <li key={index}>
                  <PieceButton
                    type="button"
                    aria-pressed={index === at}
                    $faulty={faulty.has(index)}
                    onClick={() => setSelected(index)}
                  >
                    {index + 1}. {pieceText(t, one)}
                    {one.pad !== 'none' && <Tag>{t('kart.editor.tag.pad')}</Tag>}
                    {one.boxes && <Tag>{t('kart.editor.tag.boxes')}</Tag>}
                    {faulty.has(index) && <Tag $danger>{t('kart.editor.tag.problem')}</Tag>}
                  </PieceButton>
                </li>
              ))}
            </PieceList>
          </section>

          {piece && (
            <section aria-labelledby={`${ids}piece`} data-testid="kart-editor-piece">
              <SectionTitle id={`${ids}piece`}>
                {t('kart.editor.piece.number', { n: at + 1 })}
              </SectionTitle>
              <Row>
                <Button
                  $size="sm"
                  $variant="ghost"
                  onClick={() => move(at, at - 1)}
                  disabled={at === 0}
                >
                  {t('kart.editor.up')}
                </Button>
                <Button
                  $size="sm"
                  $variant="ghost"
                  onClick={() => move(at, at + 1)}
                  disabled={at === spec.pieces.length - 1}
                >
                  {t('kart.editor.down')}
                </Button>
                <Button
                  $size="sm"
                  $variant="ghost"
                  onClick={() => addPieces([{ ...piece }])}
                  disabled={spec.pieces.length >= LIMITS.maxPieces}
                >
                  {t('kart.editor.duplicate')}
                </Button>
                <Button
                  $size="sm"
                  $variant="danger"
                  onClick={() => remove(at)}
                  disabled={spec.pieces.length <= 1}
                  data-testid="kart-editor-remove"
                >
                  {t('kart.editor.remove')}
                </Button>
              </Row>
              <Form>
                {piece.kind === 'straight' ? (
                  <NumberField
                    label={t('kart.editor.length')}
                    value={piece.length}
                    min={LIMITS.minLength}
                    max={LIMITS.maxLength}
                    onValue={(length) => editPiece(at, { length })}
                    testId="kart-editor-length"
                  />
                ) : piece.kind === 'slope' ? (
                  <>
                    <NumberField
                      label={t('kart.editor.length')}
                      value={piece.length}
                      min={LIMITS.minSlope}
                      max={LIMITS.maxLength}
                      onValue={(length) => editPiece(at, { length })}
                      testId="kart-editor-length"
                    />
                    <NumberField
                      label={t('kart.editor.rise')}
                      value={piece.rise}
                      min={-LIMITS.maxRise}
                      max={LIMITS.maxRise}
                      onValue={(rise) => editPiece(at, { rise: rise === 0 ? piece.rise : rise })}
                      testId="kart-editor-rise"
                    />
                  </>
                ) : piece.kind === 'overpass' ? (
                  <>
                    <NumberField
                      label={t('kart.editor.length')}
                      value={piece.length}
                      min={LIMITS.minOverpass}
                      max={LIMITS.maxOverpass}
                      onValue={(length) => editPiece(at, { length })}
                      testId="kart-editor-length"
                    />
                    <NumberField
                      label={t('kart.editor.overpassRise')}
                      value={piece.rise}
                      min={-LIMITS.maxOverpassRise}
                      max={LIMITS.maxOverpassRise}
                      onValue={(rise) =>
                        editPiece(at, {
                          rise:
                            Math.abs(rise) < LIMITS.minOverpassRise
                              ? Math.sign(rise || piece.rise) * LIMITS.minOverpassRise
                              : rise,
                        })
                      }
                      testId="kart-editor-overpass-rise"
                    />
                  </>
                ) : piece.kind === 'boom' || piece.kind === 'slider' ? (
                  <>
                    <NumberField
                      label={t('kart.editor.length')}
                      value={piece.length}
                      min={LIMITS.minObstacle}
                      max={LIMITS.maxLength}
                      onValue={(length) => editPiece(at, { length })}
                      testId="kart-editor-length"
                    />
                    {piece.kind === 'boom' && (
                      <Inline>
                        <span>{t('kart.editor.span')}</span>
                        <select
                          value={piece.span}
                          onChange={(event) =>
                            editPiece(at, { span: event.target.value as BoomSpan })
                          }
                          data-testid="kart-editor-span"
                        >
                          {BOOM_SPANS.map((span) => (
                            <option key={span} value={span}>
                              {t(`kart.editor.span.${span}`)}
                            </option>
                          ))}
                        </select>
                      </Inline>
                    )}
                    <NumberField
                      label={t('kart.editor.period')}
                      value={piece.period}
                      min={LIMITS.minObstaclePeriod}
                      max={LIMITS.maxObstaclePeriod}
                      onValue={(period) =>
                        editPiece(at, { period, phase: Math.min(piece.phase, tenth(period - 0.1)) })
                      }
                      testId="kart-editor-period"
                    />
                    <NumberField
                      label={t('kart.editor.phase')}
                      value={piece.phase}
                      min={0}
                      max={tenth(piece.period - 0.1)}
                      onValue={(phase) => editPiece(at, { phase })}
                      testId="kart-editor-phase"
                    />
                  </>
                ) : piece.kind === 'jump' ? (
                  <>
                    <NumberField
                      label={t('kart.editor.length')}
                      value={piece.length}
                      min={LIMITS.minJump}
                      max={LIMITS.maxJump}
                      onValue={(length) => editPiece(at, { length })}
                      testId="kart-editor-length"
                    />
                    <NumberField
                      label={t('kart.editor.jumpHeight')}
                      value={piece.height}
                      min={LIMITS.minJumpHeight}
                      max={LIMITS.maxJumpHeight}
                      onValue={(height) => editPiece(at, { height })}
                      testId="kart-editor-jump-height"
                    />
                  </>
                ) : (
                  <>
                    <Inline>
                      <span>{t('kart.editor.direction')}</span>
                      <select
                        value={piece.angle < 0 ? 'left' : 'right'}
                        onChange={(event) =>
                          editPiece(at, {
                            angle: Math.abs(piece.angle) * (event.target.value === 'left' ? -1 : 1),
                          })
                        }
                      >
                        <option value="left">{t('kart.editor.left')}</option>
                        <option value="right">{t('kart.editor.right')}</option>
                      </select>
                    </Inline>
                    <NumberField
                      label={t('kart.editor.angle')}
                      value={Math.abs(piece.angle)}
                      min={0.1}
                      max={LIMITS.maxAngle}
                      onValue={(angle) =>
                        editPiece(at, { angle: angle * (piece.angle < 0 ? -1 : 1) })
                      }
                      testId="kart-editor-angle"
                    />
                    <NumberField
                      label={t('kart.editor.radius')}
                      value={piece.radius}
                      min={LIMITS.minRadius}
                      max={LIMITS.maxRadius}
                      onValue={(radius) => editPiece(at, { radius })}
                      testId="kart-editor-radius"
                    />
                    <NumberField
                      label={t('kart.editor.bank')}
                      value={piece.bank ?? 0}
                      min={0}
                      max={LIMITS.maxBank}
                      onValue={(bank) =>
                        setPieces(
                          spec.pieces.map((one, i) => {
                            if (i !== at || one.kind !== 'turn') return one
                            const { bank: _old, ...level } = one
                            return bank > 0 ? { ...level, bank } : level
                          }),
                        )
                      }
                      testId="kart-editor-bank"
                    />
                  </>
                )}
                <NumberField
                  label={t('kart.editor.width')}
                  value={piece.width}
                  min={LIMITS.minWidth}
                  max={LIMITS.maxWidth}
                  onValue={(next) => editPiece(at, { width: next })}
                  testId="kart-editor-width"
                />
                {piece.kind !== 'jump' && piece.kind !== 'boom' && piece.kind !== 'slider' && (
                  <>
                    <Inline>
                      <span>{t('kart.editor.pad')}</span>
                      <select
                        value={piece.pad}
                        onChange={(event) => editPiece(at, { pad: event.target.value as PadPlace })}
                        data-testid="kart-editor-pad"
                      >
                        {PAD_PLACES.map((place) => (
                          <option key={place} value={place}>
                            {t(`kart.editor.pad.${place}`)}
                          </option>
                        ))}
                      </select>
                    </Inline>
                    <Inline>
                      <input
                        type="checkbox"
                        checked={piece.boxes}
                        onChange={(event) => editPiece(at, { boxes: event.target.checked })}
                        data-testid="kart-editor-boxes"
                      />
                      <span>{t('kart.editor.boxes')}</span>
                    </Inline>
                  </>
                )}
              </Form>
              {/* 2026-11-20: a bypass from this piece, a road of its own beside the road */}
              <Form data-testid="kart-editor-bypass-form">
                <SectionTitle as="h3">{t('kart.editor.bypass.title')}</SectionTitle>
                {bypassAt < 0 ? (
                  <>
                    <Hint>{t('kart.editor.bypass.help')}</Hint>
                    <Button
                      $size="sm"
                      $variant="secondary"
                      onClick={() =>
                        setBypasses([
                          ...(spec.bypasses ?? []),
                          {
                            from: at,
                            to: Math.min(at + 1, spec.pieces.length - 2),
                            side: -1,
                            offset: 50,
                            width: 16,
                          },
                        ])
                      }
                      disabled={
                        at >= spec.pieces.length - 1 ||
                        (spec.bypasses ?? []).length >= LIMITS.maxBypasses
                      }
                      data-testid="kart-editor-bypass-add"
                    >
                      {t('kart.editor.bypass.add')}
                    </Button>
                  </>
                ) : (
                  <>
                    <NumberField
                      label={t('kart.editor.bypass.to')}
                      value={spec.bypasses![bypassAt]!.to + 1}
                      min={at + 1}
                      max={spec.pieces.length - 1}
                      onValue={(to) => editBypass({ to: Math.round(to) - 1 })}
                      testId="kart-editor-bypass-to"
                    />
                    <Inline>
                      <span>{t('kart.editor.bypass.side')}</span>
                      <select
                        value={spec.bypasses![bypassAt]!.side}
                        onChange={(event) =>
                          editBypass({ side: event.target.value === '1' ? 1 : -1 })
                        }
                        data-testid="kart-editor-bypass-side"
                      >
                        <option value="-1">{t('kart.editor.bypass.left')}</option>
                        <option value="1">{t('kart.editor.bypass.right')}</option>
                      </select>
                    </Inline>
                    <NumberField
                      label={t('kart.editor.bypass.offset')}
                      value={spec.bypasses![bypassAt]!.offset}
                      min={LIMITS.minBypassOffset}
                      max={LIMITS.maxBypassOffset}
                      onValue={(offset) => editBypass({ offset })}
                      testId="kart-editor-bypass-offset"
                    />
                    <NumberField
                      label={t('kart.editor.bypass.width')}
                      value={spec.bypasses![bypassAt]!.width}
                      min={LIMITS.minBypassWidth}
                      max={LIMITS.maxBypassWidth}
                      onValue={(width) => editBypass({ width })}
                      testId="kart-editor-bypass-width"
                    />
                    <Inline>
                      <span>{t('kart.editor.bypass.feature')}</span>
                      <select
                        value={spec.bypasses![bypassAt]!.feature ?? 'none'}
                        onChange={(event) => {
                          const value = event.target.value
                          const feature = BYPASS_FEATURES.find((one) => one === value)
                          setBypasses(
                            (spec.bypasses ?? []).map((bypass, index) => {
                              if (index !== bypassAt) return bypass
                              const { feature: _old, ...plain } = bypass
                              return feature ? { ...plain, feature } : plain
                            }),
                          )
                        }}
                        data-testid="kart-editor-bypass-feature"
                      >
                        <option value="none">{t('kart.editor.bypass.feature.none')}</option>
                        {BYPASS_FEATURES.map((feature) => (
                          <option key={feature} value={feature}>
                            {t(`kart.editor.bypass.feature.${feature}`)}
                          </option>
                        ))}
                      </select>
                    </Inline>
                    <Button
                      $size="sm"
                      $variant="danger"
                      onClick={() =>
                        setBypasses((spec.bypasses ?? []).filter((_, index) => index !== bypassAt))
                      }
                      data-testid="kart-editor-bypass-remove"
                    >
                      {t('kart.editor.bypass.remove')}
                    </Button>
                  </>
                )}
              </Form>
            </section>
          )}
        </Side>

        <Main>
          <Row>
            <span>{t('kart.editor.view')}</span>
            <Button
              $size="sm"
              $variant={view === 'map' ? 'primary' : 'secondary'}
              aria-pressed={view === 'map'}
              onClick={() => setView('map')}
            >
              {t('kart.editor.view2d')}
            </Button>
            <Button
              $size="sm"
              $variant={view === '3d' ? 'primary' : 'secondary'}
              aria-pressed={view === '3d'}
              onClick={() => setView('3d')}
              data-testid="kart-editor-3d"
            >
              {t('kart.editor.view3d')}
            </Button>
            {view === '3d' && (
              <Inline>
                <input
                  type="checkbox"
                  checked={overhead}
                  onChange={(event) => setOverhead(event.target.checked)}
                />
                <span>{t('kart.editor.overhead')}</span>
              </Inline>
            )}
          </Row>
          <Stage>
            {view === 'map' ? (
              <MapView
                built={built}
                selected={at}
                faulty={faulty}
                label={t('kart.editor.map')}
                onSelect={setSelected}
              />
            ) : (
              <Suspense fallback={null}>
                <View3D track={built.track} overhead={overhead} t={t} />
              </Suspense>
            )}
          </Stage>
          <Status data-testid="kart-editor-status" $ok={legal}>
            {notice && <p role="status">{t(notice.key, notice.params)}</p>}
            {legal ? (
              <p data-testid="kart-editor-ok">
                {t('kart.editor.ok', {
                  length: Math.round(built.length),
                  count: spec.pieces.length,
                })}
              </p>
            ) : (
              <>
                <p>{t('kart.editor.problems')}</p>
                <ul data-testid="kart-editor-problems">
                  {built.problems.map((problem, index) => (
                    <li key={index}>
                      {problem.pieces.length > 0 ? (
                        <ProblemButton
                          type="button"
                          onClick={() => setSelected(problem.pieces[0]!)}
                        >
                          {problemText(t, problem)}
                        </ProblemButton>
                      ) : (
                        problemText(t, problem)
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Status>
        </Main>
      </Body>
    </Page>
  )
}

/** A number typed in and taken on Enter or leaving the box: kept in range, to a tenth */
function NumberField({
  label,
  value,
  min,
  max,
  onValue,
  testId,
}: {
  label: string
  value: number
  min: number
  max: number
  onValue(value: number): void
  testId: string
}) {
  const [draft, setDraft] = useState<{ text: string; base: number } | null>(null)
  const typing = draft !== null && draft.base === value
  const commit = () => {
    setDraft(null)
    if (!typing) return
    const number = Number(draft.text)
    if (draft.text.trim() === '' || !Number.isFinite(number)) return
    const kept = tenth(Math.min(max, Math.max(min, number)))
    if (kept !== value) onValue(kept)
  }
  return (
    <Inline>
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={1}
        value={typing ? draft.text : String(value)}
        onChange={(event) => setDraft({ text: event.target.value, base: value })}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
        data-testid={testId}
      />
    </Inline>
  )
}

const Page = styled.main`
  display: grid;
  grid-template-rows: auto auto 1fr;
  min-height: 100dvh;
  background: ${color.bg};
  color: ${color.text};
`

const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px ${space.md}px;
  padding: ${space.sm}px ${space.lg}px;
  border-bottom: 1px solid ${color.border};
  background: ${color.surface};
`

const Title = styled.h1`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
  margin-left: auto;
`

const DriveLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 ${space.md}px;
  border-radius: ${radius.component}px;
  background: ${color.accent};
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-decoration: none;
`

const Hint = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm};
`

const Inline = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;
  font-size: ${fontSize.sm}px;
  font-weight: 600;

  & > input:not([type='checkbox']),
  & > select {
    min-height: 32px;
    min-width: 0;
    max-width: 14em;
    padding: 0 ${space.xs}px;
    color: ${color.text};
    background: ${color.sunken};
    border: 1px solid ${color.border};
    font: inherit;
  }

  & > input[type='number'] {
    width: 6em;
  }
`

const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  min-height: 0;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const Side = styled.div`
  display: grid;
  align-content: start;
  gap: ${space.lg}px;
  padding: ${space.md}px ${space.lg}px;
  border-right: 1px solid ${color.border};
  overflow-y: auto;
  max-height: calc(100dvh - 64px);

  @media (max-width: 760px) {
    order: 2;
    border-right: none;
    max-height: none;
  }
`

const SectionTitle = styled.h2`
  margin: 0 0 ${space.xs}px;
  font-size: ${fontSize.md}px;
`

const Note = styled.p`
  margin: 0 0 ${space.sm}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Palette = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: ${space.xs}px;
`

const PieceList = styled.ol`
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 260px;
  overflow-y: auto;
`

const PieceButton = styled.button<{ $faulty: boolean }>`
  width: 100%;
  min-height: 32px;
  padding: ${space.xs}px ${space.sm}px;
  text-align: left;
  color: ${color.text};
  background: ${color.sunken};
  border: 1px solid ${({ $faulty }) => ($faulty ? color.danger : color.border)};
  font: inherit;
  font-size: ${fontSize.sm}px;
  cursor: pointer;

  &[aria-pressed='true'] {
    border-color: ${color.accent};
    box-shadow: inset 4px 0 0 ${color.accent};
  }
`

const Tag = styled.span<{ $danger?: boolean }>`
  margin-left: ${space.xs}px;
  padding: 0 ${space.xs}px;
  border-radius: ${radius.component}px;
  background: ${({ $danger }) => ($danger ? color.danger : color.surface)};
  color: ${({ $danger }) => ($danger ? color.onAccent : color.muted)};
  font-size: ${fontSize.sm}px;
`

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
  font-size: ${fontSize.sm}px;
`

const Form = styled.div`
  display: grid;
  gap: ${space.sm}px;
  margin-top: ${space.sm}px;
`

const Main = styled.div`
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: ${space.sm}px;
  padding: ${space.md}px ${space.lg}px;
  min-height: 0;
`

const Stage = styled.div`
  position: relative;
  min-height: 320px;
  height: calc(100dvh - 300px);
  overflow: hidden;
  border: 1px solid ${color.border};
  background: ${color.sunken};

  @media (max-width: 760px) {
    height: 60vw;
  }
`

const Status = styled.div<{ $ok: boolean }>`
  padding: ${space.sm}px ${space.md}px;
  border-left: 4px solid ${({ $ok }) => ($ok ? color.success : color.danger)};
  background: ${color.surface};
  font-size: ${fontSize.sm}px;

  p,
  ul {
    margin: 0;
  }

  ul {
    padding-left: ${space.lg}px;
  }
`

const ProblemButton = styled.button`
  padding: 0;
  color: inherit;
  background: none;
  border: none;
  font: inherit;
  text-align: left;
  text-decoration: underline;
  cursor: pointer;
`

const Sheet = styled.section`
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.md}px ${space.lg}px;
  border-bottom: 1px solid ${color.border};
  background: ${color.surface};
`

const SheetTitle = styled.h2`
  margin: 0;
  font-size: ${fontSize.md}px;
`

const LinkBox = styled.input`
  width: 100%;
  min-height: 36px;
  padding: 0 ${space.sm}px;
  color: ${color.text};
  background: ${color.sunken};
  border: 1px solid ${color.border};
  font: inherit;
  font-size: ${fontSize.sm}px;
`

const SaveList = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: ${space.sm}px;
  }

  li > span {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
`
