// The reactions floating on screen (e7-t11): shared by useRoom.ts and the lazy Reactions.tsx, apart
// from both so that the lazy chunk does not pull the room's hook (and the bundler split it out)

/** A reaction on its way up the screen; `id` tells two of the same apart */
export type FloatingReaction = { id: number; member: string; reaction: number }

/** How long a reaction floats before it is gone */
export const REACTION_FLOAT_MS = 2400
