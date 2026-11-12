// Turning a module's `OptionsSchema` into values: the defaults for a new room, and a host's choices
// checked (they come off the network).
import type { AnyOptionField, OptionsSchema, OptionValues } from './types.ts'

const fieldsOf = <O extends OptionValues>(schema: OptionsSchema<O>) =>
  Object.entries(schema as unknown as Record<string, AnyOptionField>)

export function defaultOptions<O extends OptionValues>(schema: OptionsSchema<O>): O {
  return Object.fromEntries(fieldsOf(schema).map(([key, field]) => [key, field.default])) as O
}

function isValid(field: AnyOptionField, value: unknown): boolean {
  switch (field.kind) {
    case 'boolean':
      return typeof value === 'boolean'
    case 'int':
      return Number.isInteger(value) && Number(value) >= field.min && Number(value) <= field.max
    case 'select':
      return field.choices.some((choice) => choice.value === value)
  }
}

/** Valid options from anything: a missing or invalid field gets its default, unknown keys go */
export function parseOptions<O extends OptionValues>(schema: OptionsSchema<O>, raw: unknown): O {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return Object.fromEntries(
    fieldsOf(schema).map(([key, field]) => {
      const value = Object.hasOwn(source, key) ? source[key] : undefined
      return [key, isValid(field, value) ? value : field.default]
    }),
  ) as O
}

/**
 * A host's new options with every hidden field kept as the room has it: the browser's form does not
 * know those fields, so whatever it sends for them is not the host's choice (types.ts, `hidden`)
 */
export function keepHidden<O extends OptionValues>(
  schema: OptionsSchema<O>,
  current: OptionValues,
  raw: unknown,
): O {
  const source: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? { ...(raw as Record<string, unknown>) } : {}
  for (const [key, field] of fieldsOf(schema)) {
    if (!field.hidden) continue
    if (Object.hasOwn(current, key)) source[key] = current[key]
    else delete source[key]
  }
  return parseOptions(schema, source)
}
