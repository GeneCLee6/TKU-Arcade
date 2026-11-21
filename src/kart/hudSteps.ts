// The HUD's steps (spikeLoop.ts sends them, Hud.tsx draws them), apart from the engine

/** The HUD's meters move in twentieths, so that the HUD is drawn again only when one moves */
export const HUD_STEPS = 20
