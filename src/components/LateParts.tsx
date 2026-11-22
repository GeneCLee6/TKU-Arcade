// The components that draw the room's late parts (src/lib/lateParts.ts): nothing until the part has
// loaded, then the part itself. A tap on a phone's dock before the sheet has arrived opens it as soon
// as it has.
import { createElement, useEffect } from 'react'
import { bannerChunk, chatPanelChunk, drawerChunk } from '../lib/lateParts.ts'
import type { ChatPanelProps } from './ChatPanel.tsx'
import type { ConnectionBannerProps } from './ConnectionBanner.tsx'
import type { DrawerProps } from './Drawer.tsx'
import type { TabsProps } from './Tabs.tsx'

export function LateChatPanel(props: ChatPanelProps) {
  const ChatPanel = chatPanelChunk.use()
  return ChatPanel && createElement(ChatPanel, props)
}

export function LateDrawer(props: DrawerProps) {
  const parts = drawerChunk.use()
  return parts && createElement(parts.Drawer, props)
}

export function LateTabs<Id extends string>(props: TabsProps<Id>) {
  const parts = drawerChunk.use()
  return parts && createElement(parts.Tabs<Id>, props)
}

/** A load that failed (the network went with the socket) is tried again on the next drop */
export function LateConnectionBanner(props: ConnectionBannerProps) {
  const Banner = bannerChunk.use()
  const { reconnecting } = props
  useEffect(() => {
    if (Banner === null && reconnecting) bannerChunk.load().catch(() => {})
  }, [Banner, reconnecting])
  return Banner && createElement(Banner, props)
}
