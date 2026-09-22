// Runtime image only (apps/server/Dockerfile): pnpm installs the optional peers of the production
// dependencies (better-auth: next, vitest…; @prisma/client: the prisma CLI) even with --prod,
// because the workspace's devDependencies satisfy them. This keeps what the server can load
// - dependencies, optionalDependencies and required peers, followed from package.json - and
// deletes every other package from node_modules/.pnpm, then the links left dangling.
import { lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import path from 'node:path'

const serverDir = process.argv[2]
const storeDir = path.resolve(serverDir, '../../node_modules/.pnpm')

function manifestOf(dir) {
  return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
}

// Where `name` resolves from `fromDir`, as Node would: the nearest node_modules up the tree.
function resolvePackage(fromDir, name) {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name)
    try {
      return realpathSync(candidate)
    } catch {}
    if (dir === path.dirname(dir)) return undefined
  }
}

function requiredNames(manifest, isRoot) {
  const optionalPeers = manifest.peerDependenciesMeta ?? {}
  const peers = Object.keys(manifest.peerDependencies ?? {}).filter(
    (name) => !optionalPeers[name]?.optional,
  )
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...(isRoot ? [] : peers),
  ]
}

const reachable = new Set()
const pending = [realpathSync(serverDir)]
while (pending.length > 0) {
  const dir = pending.pop()
  if (reachable.has(dir)) continue
  reachable.add(dir)
  const manifest = manifestOf(dir)
  for (const name of requiredNames(manifest, dir === realpathSync(serverDir))) {
    const target = resolvePackage(dir, name)
    // A missing optional dependency (another platform) is fine.
    if (target) pending.push(target)
  }
}

// `.pnpm/<id>/node_modules/<name>`: an entry is kept when any package inside it is reachable.
let removed = 0
for (const entry of readdirSync(storeDir)) {
  const modules = path.join(storeDir, entry, 'node_modules')
  let keep = false
  try {
    for (const item of readdirSync(modules)) {
      const names = item.startsWith('@')
        ? readdirSync(path.join(modules, item)).map((sub) => `${item}/${sub}`)
        : [item]
      if (names.some((name) => reachable.has(path.join(modules, name)))) keep = true
    }
  } catch {
    continue
  }
  if (!keep) {
    rmSync(path.join(storeDir, entry), { recursive: true, force: true })
    removed++
  }
}

// Links that pointed into a removed package (e.g. a dependency's optional peer).
function removeDangling(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isSymbolicLink()) {
      try {
        realpathSync(full)
      } catch {
        rmSync(full, { force: true })
      }
    } else if (
      item.isDirectory() &&
      (item.name === 'node_modules' || item.name.startsWith('@') || dir.endsWith('node_modules'))
    ) {
      if (!lstatSync(full).isSymbolicLink()) removeDangling(full)
    }
  }
}
removeDangling(path.resolve(serverDir, '../../node_modules'))
removeDangling(path.join(serverDir, 'node_modules'))

process.stdout.write(
  `prune-runtime: kept ${reachable.size - 1} packages, removed ${removed} store entries\n`,
)
