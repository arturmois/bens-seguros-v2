// Follows the operating system preference until a user-selectable theme exists.
export function syncThemeWithSystem() {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => document.documentElement.classList.toggle('dark', query.matches)
  apply()
  query.addEventListener('change', apply)
}
