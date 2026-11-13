import { useState } from 'react'
import styled from 'styled-components'
import '../i18n/roomExtras.ts'
import { useT } from '../i18n/useT.ts'
import { openVoiceRoom } from '../lib/voice.ts'
import { color, fontSize } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import type { ChatPanelProps } from './ChatPanel.tsx'

/**
 * Opens a LongTalk voice room and posts its link here (e1-t14). Only where the site can open one,
 * and not while the game has the chat closed: the link is a chat message like any other
 */
export default function VoiceButton({ locked, onSend }: Pick<ChatPanelProps, 'locked' | 'onSend'>) {
  const t = useT()
  const [opening, setOpening] = useState(false)
  // What went wrong, said beside the button: the panel may be where nothing else would show it
  const [problem, setProblem] = useState<string | null>(null)
  const open = async () => {
    setOpening(true)
    setProblem(null)
    const url = await openVoiceRoom()
    if (url === null) {
      setOpening(false)
      setProblem(t('room.extra.voice.failed'))
      return
    }
    const result = await onSend(t('room.extra.voice.message', { url }))
    setOpening(false)
    if (result !== 'sent') setProblem(t('room.extra.voice.notPosted', { url }))
  }
  return (
    <>
      <Button $variant="ghost" $size="sm" disabled={locked || opening} onClick={() => void open()}>
        {t(opening ? 'room.extra.voice.opening' : 'room.extra.voice.open')}
      </Button>
      {problem && <VoiceProblem role="alert">{problem}</VoiceProblem>}
    </>
  )
}

const VoiceProblem = styled.p`
  flex-basis: 100%;
  margin: 0;
  color: ${color.danger};
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`
