// e10-t08: controls a game's text option can ask for by name (`TextOption.control`), each its own
// lazy chunk so that the waiting room loads one only for the game and the field that use it.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export interface OptionControlProps {
  /** The room's value */
  readonly value: string
  /** The host's working control; anyone else sees what the value is */
  readonly editable: boolean
  /** The host picked a new value */
  onPick(value: string): void
}

export const OPTION_CONTROLS: Readonly<
  Record<string, LazyExoticComponent<ComponentType<OptionControlProps>>>
> = {
  // A race room's custom track: a pasted link, or one of this browser's saved tracks
  'kart-track': lazy(() => import('../kart/editor/RoomTrackPicker.tsx')),
}
