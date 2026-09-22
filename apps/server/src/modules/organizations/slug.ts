const MAX_SLUG_LENGTH = 48

// Public organization slug: lowercase, no accents, punctuation becomes a hyphen.
export function slugFromName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
  return base.length > 0 ? base : 'org'
}

export function slugCandidate(base: string, attempt: number): string {
  if (attempt === 1) return base
  const suffix = `-${attempt}`
  return `${base.slice(0, MAX_SLUG_LENGTH - suffix.length)}${suffix}`
}
