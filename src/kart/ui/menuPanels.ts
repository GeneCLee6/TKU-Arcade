// 2026-11-23 (docs/KART-PERF.md §11): the panels a player opens now and then (the garage, the race
// against the computer, the Grand Prix, the tuning, the keys, the settings, the buttons' own), in one
// lazy chunk fetched when the first of them is opened. One chunk rather than eight: each chunk is
// compressed on its own, and eight small ones cost more to fetch than the one they make.
export { GaragePanel } from '../roster/GaragePanel.tsx'
export { ControlsPanel } from '../ControlsPanel.tsx'
export { TuningPanel } from '../TuningPanel.tsx'
export { BotSetupPanel } from '../bots/BotSetupPanel.tsx'
export { CupSetupPanel } from '../cup/CupSetupPanel.tsx'
export { SettingsDialog, SettingsPanel } from './SettingsPanel.tsx'
export { TouchSettingsPanel } from '../touch/TouchSettingsPanel.tsx'
