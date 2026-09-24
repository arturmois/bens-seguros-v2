// Local proof of scripts/env-push.sh (feature `env-push`): each step proves checks of
// .specs/features/env-push/checks.md. The script runs from a scratch copy of the repository with a
// scratch HOME; an `ssh` stub runs the remote commands with real bash against a scratch DEPLOY_PATH,
// and a `docker` stub on the remote side records what the script asked of Docker.
//   node scripts/env-push-smoke.mjs <step>   one step; exits 1 on the first failed assertion
//   node scripts/env-push-smoke.mjs all      every step
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = (line) => process.stdout.write(`${line}\n`)
const fail = (line) => process.stderr.write(`${line}\n`)

const SCRATCH = join(tmpdir(), 'bens-env-push-smoke')
const TRANSCRIPT = join(tmpdir(), 'bens-env-push-smoke.transcript')
const REPO = join(SCRATCH, 'repo')
const HOME = join(SCRATCH, 'home')
const REMOTE = join(SCRATCH, 'remote')
const STUB = join(SCRATCH, 'stub')
const REMOTE_STUB = join(SCRATCH, 'remote-stub')
const CALLS = join(SCRATCH, 'ssh-calls')
const DOCKER_CALLS = join(SCRATCH, 'docker-calls')
const VOLUMES = join(SCRATCH, 'volumes')

const KEY = join(HOME, '.ssh/bens-deploy-staging')
const KNOWN_HOSTS = join(HOME, '.ssh/bens-known_hosts-staging')
const LOCAL = join(REPO, '.env.staging')
const REMOTE_ENV = join(REMOTE, '.env')
const VOLUME = 'bens-seguros-prod_postgres-data'
const SECRET_KEYS = [
  'POSTGRES_PASSWORD',
  'APP_DB_PASSWORD',
  'BETTER_AUTH_SECRET',
  'SMTP_URL',
  'TURNSTILE_SECRET_KEY',
]
const EXAMPLE_KEYS = [...readFileSync('.env.prod.example', 'utf8').matchAll(/^([A-Z_]+)=/gm)].map(
  (match) => match[1],
)

// Every secret value any step used, so `no-leak` can look for each one in the transcript.
const secrets = new Set()

function assert(condition, message) {
  if (!condition) throw new Error(message)
  out(`  ok - ${message}`)
}

const SSH_STUB = `#!/usr/bin/env bash
set -euo pipefail
n=$(find "$CALLS" -type f | wc -l)
printf '%s\\0' "$@" > "$CALLS/$((n + 1))"
cmd=\${!#}
if [ "\${STUB_CORRUPT:-}" = 1 ]; then
  input=$(cat)
  printf '%s\\n' "$input" | sed '$d' | PATH="$REMOTE_STUB:$PATH" bash -c "$cmd"
else
  PATH="$REMOTE_STUB:$PATH" bash -c "$cmd"
fi
`

const DOCKER_STUB = `#!/usr/bin/env bash
n=$(find "$DOCKER_CALLS" -maxdepth 1 -type f -name 'call-*' | wc -l)
printf '%s\\0' "$PWD" "$@" > "$DOCKER_CALLS/call-$((n + 1))"
if [ "$1" = volume ] && [ "$2" = inspect ]; then
  [ -e "$VOLUMES/$3" ]
  exit
fi
if [ "$1" = compose ]; then
  cp .env "$DOCKER_CALLS/env-at-compose"
  exit "\${STUB_UP_EXIT:-0}"
fi
exit 0
`

function fresh() {
  rmSync(SCRATCH, { recursive: true, force: true })
  for (const dir of [
    join(REPO, 'scripts'),
    join(HOME, '.ssh'),
    REMOTE,
    STUB,
    REMOTE_STUB,
    CALLS,
    DOCKER_CALLS,
    VOLUMES,
  ]) {
    mkdirSync(dir, { recursive: true })
  }
  copyFileSync('scripts/env-push.sh', join(REPO, 'scripts/env-push.sh'))
  chmodSync(join(REPO, 'scripts/env-push.sh'), 0o755)
  copyFileSync('.env.prod.example', join(REPO, '.env.prod.example'))
  writeFileSync(KEY, 'not a real key\n', { mode: 0o600 })
  writeFileSync(KNOWN_HOSTS, '203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeHostKey\n')
  writeFileSync(join(STUB, 'ssh'), SSH_STUB, { mode: 0o755 })
  writeFileSync(join(REMOTE_STUB, 'docker'), DOCKER_STUB, { mode: 0o755 })
}

function parse(text) {
  const values = {}
  for (const match of text.matchAll(/^([A-Z_]+)=(.*)$/gm)) {
    values[match[1]] = match[2].replace(/^"(.*)"$/, '$1')
  }
  return values
}

// A valid file in the example's key order; `overrides` replaces values, `null` drops the key.
function envText(overrides = {}) {
  const values = {
    SITE_ADDRESS: 'staging.bens.test',
    APP_URL: 'https://staging.bens.test',
    HTTP_PORT: '80',
    HTTPS_PORT: '443',
    POSTGRES_USER: 'bens',
    POSTGRES_PASSWORD: `pg${randomBytes(20).toString('hex')}`,
    POSTGRES_DB: 'bens',
    APP_DB_PASSWORD: `app${randomBytes(20).toString('hex')}`,
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
    SMTP_URL: `smtps://resend:re_${randomBytes(12).toString('hex')}@smtp.resend.com:465`,
    EMAIL_FROM: '"Bens Seguros <nao-responda@bens.test>"',
    LOG_LEVEL: 'info',
    SIGNUP_MODE: 'self_serve',
    TURNSTILE_SECRET_KEY: `ts${randomBytes(12).toString('hex')}`,
    TURNSTILE_SITE_KEY: 'site-key-1',
    ...overrides,
  }
  const lines = []
  for (const key of EXAMPLE_KEYS) {
    if (values[key] !== null) lines.push(`${key}=${values[key]}`)
  }
  return `${lines.join('\n')}\n`
}

function remember(text) {
  const values = parse(text)
  for (const key of SECRET_KEYS) {
    if (values[key]) secrets.add(values[key])
  }
}

function writeLocal(text) {
  remember(text)
  writeFileSync(LOCAL, text, { mode: 0o600 })
}

function writeRemote(text) {
  remember(text)
  writeFileSync(REMOTE_ENV, text, { mode: 0o600 })
}

function run(args, { input = '', env = {}, command = join(REPO, 'scripts/env-push.sh') } = {}) {
  const result = spawnSync(command, args, {
    cwd: SCRATCH,
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME,
      PATH: `${STUB}:${process.env.PATH}`,
      CALLS,
      REMOTE_STUB,
      DOCKER_CALLS,
      VOLUMES,
      DEPLOY_PATH: REMOTE,
      SSH_HOST: '',
      SSH_USER: '',
      SSH_KEY: '',
      SSH_KNOWN_HOSTS_FILE: '',
      ...env,
    },
  })
  appendFileSync(TRANSCRIPT, `${result.stdout}${result.stderr}`)
  if (existsSync(LOCAL)) remember(readFileSync(LOCAL, 'utf8'))
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

function sshCalls() {
  return readdirSync(CALLS)
    .sort((a, b) => Number(a) - Number(b))
    .map((file) => readFileSync(join(CALLS, file), 'utf8').split('\0').slice(0, -1))
}

function composeCalls() {
  return readdirSync(DOCKER_CALLS)
    .filter((file) => file.startsWith('call-'))
    .map((file) => readFileSync(join(DOCKER_CALLS, file), 'utf8').split('\0').slice(0, -1))
    .filter(([, command]) => command === 'compose')
}

const read = (file) => readFileSync(file, 'utf8')
const mode = (file) => statSync(file).mode & 0o777
const ANSWERS = 'staging.bens.test\nre_key123\nnao-responda@bens.test\nsite-key-1\nsecret-key-1\n'

// One broken local file: exit 1, the key named on stderr, no ssh call.
function rejects(label, text, named) {
  fresh()
  writeLocal(text)
  const result = run(['staging'])
  assert(result.code === 1, `${label}: exits 1`)
  assert(result.stderr.includes(named), `${label}: names ${named}`)
  assert(sshCalls().length === 0, `${label}: no ssh call`)
}

function accepts(label, text) {
  fresh()
  writeLocal(text)
  const result = run(['staging'])
  assert(result.code === 0, `${label}: passes validation and is sent (${result.stderr.trim()})`)
}

const steps = {
  // C1-C3
  generate() {
    fresh()
    const first = run(['staging'], { input: ANSWERS })
    assert(first.code === 0, `generates and sends (${first.stderr.trim()})`)
    assert(mode(LOCAL) === 0o600, '.env.staging has mode 600')
    const values = parse(read(LOCAL))
    assert(
      Object.keys(values).sort().join() === [...EXAMPLE_KEYS].sort().join(),
      `holds exactly the ${EXAMPLE_KEYS.length} keys of .env.prod.example`,
    )
    assert(/^[0-9a-f]{48}$/.test(values.POSTGRES_PASSWORD), 'POSTGRES_PASSWORD is 48 hex')
    assert(/^[0-9a-f]{48}$/.test(values.APP_DB_PASSWORD), 'APP_DB_PASSWORD is 48 hex')
    assert(values.POSTGRES_PASSWORD !== values.APP_DB_PASSWORD, 'the two passwords differ')
    assert(
      /^[A-Za-z0-9+/]{43}=$/.test(values.BETTER_AUTH_SECRET),
      'BETTER_AUTH_SECRET is base64 of 44',
    )
    const expected = {
      SITE_ADDRESS: 'staging.bens.test',
      APP_URL: 'https://staging.bens.test',
      SMTP_URL: 'smtps://resend:re_key123@smtp.resend.com:465',
      TURNSTILE_SITE_KEY: 'site-key-1',
      TURNSTILE_SECRET_KEY: 'secret-key-1',
      HTTP_PORT: '80',
      HTTPS_PORT: '443',
      POSTGRES_USER: 'bens',
      POSTGRES_DB: 'bens',
      SIGNUP_MODE: 'self_serve',
      LOG_LEVEL: 'info',
    }
    for (const [key, value] of Object.entries(expected)) {
      assert(values[key] === value, `${key}=${value}`)
    }
    assert(
      /^EMAIL_FROM="Bens Seguros <nao-responda@bens.test>"$/m.test(read(LOCAL)),
      'EMAIL_FROM="Bens Seguros <nao-responda@bens.test>"',
    )

    fresh()
    assert(run(['staging'], { input: ANSWERS }).code === 0, 'a second generation succeeds')
    const second = parse(read(LOCAL))
    for (const key of ['POSTGRES_PASSWORD', 'APP_DB_PASSWORD', 'BETTER_AUTH_SECRET']) {
      assert(second[key] !== values[key], `${key} differs between two generations`)
    }
  },

  // C4, C35
  existing() {
    fresh()
    const text = envText()
    writeLocal(text)
    const result = run(['staging'], { input: 'junk\njunk\njunk\njunk\njunk\n' })
    assert(result.code === 0, `sends the existing file (${result.stderr.trim()})`)
    assert(read(LOCAL) === text, '.env.staging is byte-identical')
    assert(read(REMOTE_ENV) === text, 'the remote .env is the existing file')

    // C35: nothing of stdin is consumed - a `cat` after the script in the same shell gets it all.
    const junk = 'junk-1\njunk-2\njunk-3\njunk-4\njunk-5\n'
    const shared = run(['-c', `${join(REPO, 'scripts/env-push.sh')} staging; cat`], {
      input: junk,
      command: 'bash',
    })
    assert(shared.code === 0, `script then cat: exits 0 (${shared.stderr.trim()})`)
    assert(shared.stdout.endsWith(junk), 'the five stdin lines reach the cat after the script')
    assert(!shared.stderr.includes('Domínio'), 'no prompt is printed')
  },

  // C5
  usage() {
    for (const args of [[], ['dev'], ['staging', 'extra'], ['staging', '--force']]) {
      fresh()
      const result = run(args)
      const label = `args [${args.join(' ')}]`
      assert(result.code === 1, `${label}: exits 1`)
      assert(/^env-push: uso:/m.test(result.stderr), `${label}: prints env-push: uso:`)
      assert(
        readdirSync(REPO).filter((file) => file.startsWith('.env.') && file !== '.env.prod.example')
          .length === 0,
        `${label}: writes no .env.*`,
      )
      assert(sshCalls().length === 0, `${label}: no ssh call`)
    }
  },

  // C6-C10
  validate() {
    for (const key of EXAMPLE_KEYS) {
      rejects(`${key} absent`, envText({ [key]: null }), key)
      rejects(`${key} empty`, envText({ [key]: '' }), key)
    }
    for (const url of [
      'http://staging.bens.test',
      'https://other.bens.test',
      'https://staging.bens.test/',
    ]) {
      rejects(`APP_URL=${url}`, envText({ APP_URL: url }), 'APP_URL')
    }
    rejects('secret of 31', envText({ BETTER_AUTH_SECRET: 'a'.repeat(31) }), 'BETTER_AUTH_SECRET')
    accepts('secret of 32', envText({ BETTER_AUTH_SECRET: 'a'.repeat(32) }))
    for (const key of ['POSTGRES_PASSWORD', 'APP_DB_PASSWORD']) {
      for (const bad of ['@', '/', ':', '#', '%', ' ']) {
        rejects(`${key} with '${bad}'`, envText({ [key]: `abc${bad}def` }), key)
      }
      accepts(`${key}=aZ09._~-`, envText({ [key]: 'aZ09._~-' }))
    }
    rejects(
      'SMTP_URL placeholder',
      envText({ SMTP_URL: 'smtps://resend:<RESEND_API_KEY>@smtp.resend.com:465' }),
      'SMTP_URL',
    )
    rejects(
      'example.com domain',
      envText({ SITE_ADDRESS: 'staging.example.com', APP_URL: 'https://staging.example.com' }),
      'SITE_ADDRESS',
    )
  },

  // C11
  'missing-files'() {
    for (const path of [KEY, KNOWN_HOSTS]) {
      fresh()
      writeLocal(envText())
      rmSync(path)
      const result = run(['staging'])
      assert(result.code === 1, `without ${path}: exits 1`)
      assert(result.stderr.includes(path), `without ${path}: names it`)
      assert(sshCalls().length === 0, `without ${path}: no ssh call`)
    }
  },

  // C12-C14, C22
  send() {
    fresh()
    const text = envText()
    writeLocal(text)
    writeFileSync(join(REMOTE, 'deploy.env'), 'IMAGE_TAG=sha-x\n')
    const result = run(['staging'])
    assert(result.code === 0, `exits 0 (${result.stderr.trim()})`)
    assert(read(REMOTE_ENV) === text, 'the remote .env is byte-identical to the local file')
    assert(mode(REMOTE_ENV) === 0o600, 'the remote .env has mode 600')
    assert(!existsSync(join(REMOTE, '.env.push')), 'no .env.push remains')
    const calls = sshCalls()
    assert(calls.length > 0, 'ssh was called')
    for (const argv of calls) {
      const joined = argv.join(' ')
      for (const option of [
        `-i ${KEY}`,
        '-o IdentitiesOnly=yes',
        '-o BatchMode=yes',
        '-o StrictHostKeyChecking=yes',
        `-o UserKnownHostsFile=${KNOWN_HOSTS}`,
      ]) {
        assert(joined.includes(option), `ssh carries ${option}`)
      }
      assert(argv.includes('deploy@203.0.113.10'), 'ssh targets deploy@203.0.113.10')
      const values = parse(text)
      for (const key of SECRET_KEYS) {
        assert(!joined.includes(values[key]), `no ssh argument holds ${key}`)
      }
    }
    assert(composeCalls().length === 0, 'without --apply, no docker compose')

    rmSync(CALLS, { recursive: true })
    mkdirSync(CALLS)
    const other = run(['staging'], { env: { SSH_USER: 'ops', SSH_HOST: '198.51.100.7' } })
    assert(other.code === 0, `with SSH_USER and SSH_HOST: exits 0 (${other.stderr.trim()})`)
    assert(
      sshCalls().every((argv) => argv.includes('ops@198.51.100.7')),
      'with SSH_USER and SSH_HOST: targets ops@198.51.100.7',
    )
  },

  // C15
  corrupt() {
    fresh()
    const text = envText()
    writeLocal(text)
    const before = text.replace('LOG_LEVEL=info', 'LOG_LEVEL=debug')
    writeRemote(before)
    const result = run(['staging'], { env: { STUB_CORRUPT: '1' } })
    assert(result.code === 1, 'a truncated transfer exits 1')
    assert(read(REMOTE_ENV) === before, 'the remote .env is byte-identical to before')
    assert(!existsSync(join(REMOTE, '.env.push')), 'no .env.push remains')
  },

  // C16
  'db-guard'() {
    for (const key of ['POSTGRES_USER', 'POSTGRES_DB', 'POSTGRES_PASSWORD', 'APP_DB_PASSWORD']) {
      fresh()
      const text = envText()
      writeLocal(text)
      const old = `old${randomBytes(8).toString('hex')}`
      const beforeText = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${old}`)
      writeRemote(beforeText)
      const result = run(['staging'])
      assert(result.code === 1, `${key} changed: exits 1`)
      assert(result.stderr.includes(key), `${key} changed: names ${key}`)
      assert(!result.stderr.includes(old), `${key} changed: the old value is not printed`)
      assert(
        !result.stderr.includes(parse(text)[key]),
        `${key} changed: the new value is not printed`,
      )
      assert(read(REMOTE_ENV) === beforeText, `${key} changed: the remote .env is untouched`)
    }
  },

  // C17
  'volume-guard'() {
    fresh()
    writeLocal(envText())
    writeFileSync(join(VOLUMES, VOLUME), '')
    const result = run(['staging'])
    assert(result.code === 1, 'volume without .env: exits 1')
    assert(result.stderr.includes('banco já existe'), 'volume without .env: says banco já existe')
    assert(!existsSync(REMOTE_ENV), 'volume without .env: no remote .env written')
  },

  // C18
  replace() {
    fresh()
    const text = envText()
    writeLocal(text)
    writeRemote(text.replace('LOG_LEVEL=info', 'LOG_LEVEL=debug'))
    const result = run(['staging'])
    assert(result.code === 0, `same database values: exits 0 (${result.stderr.trim()})`)
    assert(read(REMOTE_ENV) === text, 'the remote .env becomes the local file')
  },

  // C20
  apply() {
    fresh()
    const text = envText()
    writeLocal(text)
    writeFileSync(join(REMOTE, 'deploy.env'), 'IMAGE_TAG=sha-x\n')
    const result = run(['staging', '--apply'])
    assert(result.code === 0, `exits 0 (${result.stderr.trim()})`)
    const calls = composeCalls()
    assert(calls.length === 1, 'one docker compose call')
    const [cwd, ...args] = calls[0]
    assert(
      args.join(' ') ===
        'compose -f docker-compose.prod.yml --env-file .env --env-file deploy.env up -d --wait --no-build',
      `docker ${args.join(' ')}`,
    )
    assert(cwd === REMOTE, 'runs in DEPLOY_PATH')
    assert(
      read(join(DOCKER_CALLS, 'env-at-compose')) === text,
      'the remote .env was already the new one when compose ran',
    )
  },

  // C21
  'apply-first'() {
    fresh()
    const text = envText()
    writeLocal(text)
    const result = run(['staging', '--apply'])
    assert(result.code === 0, `exits 0 (${result.stderr.trim()})`)
    assert(read(REMOTE_ENV) === text, 'the remote .env is the local file')
    assert(composeCalls().length === 0, 'no docker compose')
    assert(result.stdout.includes('primeiro deploy'), 'says the first deploy applies it')
  },

  // C23
  'apply-fails'() {
    fresh()
    const text = envText()
    writeLocal(text)
    writeFileSync(join(REMOTE, 'deploy.env'), 'IMAGE_TAG=sha-x\n')
    const result = run(['staging', '--apply'], { env: { STUB_UP_EXIT: '1' } })
    assert(result.code === 1, 'exits 1')
    assert(result.stderr.includes('.env novo já está na VPS'), 'says the new .env is on the VPS')
    assert(read(REMOTE_ENV) === text, 'the remote .env is the local file')
  },

  // C19
  'no-leak'() {
    writeFileSync(TRANSCRIPT, '')
    for (const name of SCRIPT_STEPS) steps[name]()
    const transcript = read(TRANSCRIPT)
    assert(secrets.size > 20, `collected ${secrets.size} secret values`)
    const leaked = [...secrets].filter((value) => transcript.includes(value))
    assert(leaked.length === 0, `the output holds none of the ${secrets.size} secrets`)
  },

  // C25-C31, C33 (C26 also through `node scripts/staging-smoke.mjs runbook`)
  runbook() {
    const text = read('docs/runbooks/deploy.md')
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    const section = (title) => {
      const from = text.indexOf(`\n## ${title}`)
      assert(from >= 0, `has the section ${title}`)
      const to = text.indexOf('\n## ', from + 1)
      return text.slice(from, to < 0 ? undefined : to)
    }
    const env = section('.env')
    assert(
      env.includes('scripts/env-push.sh staging'),
      '.env section runs scripts/env-push.sh staging',
    )
    for (const word of ['nano', 'curl', 'sudo -iu deploy']) {
      assert(!env.includes(word), `.env section has no ${word}`)
    }
    const key = headings.findIndex((heading) => heading.startsWith('Chave SSH do deploy'))
    const dotenv = headings.findIndex((heading) => heading.startsWith('.env'))
    assert(key >= 0 && key < dotenv, 'Chave SSH do deploy comes before .env')
    assert(
      /^.*ssh .*-o PasswordAuthentication=no.*SUDO_OK.*$/m.test(text),
      'the ops access test forces key authentication',
    )
    const hardening = text.indexOf('/etc/ssh/sshd_config.d/01-hardening.conf')
    assert(hardening >= 0, 'writes 01-hardening.conf')
    assert(!text.includes('99-hardening.conf'), 'no 99-hardening.conf')
    assert(
      /sshd -T.*passwordauthentication/.test(text.slice(hardening)),
      'checks the effective configuration with sshd -T',
    )
    const ps = [...text.matchAll(/\b(?:dc|docker compose[^\n`]*?) ps\b(.{0,3})/g)]
    assert(ps.length > 0, `mentions compose ps (${ps.length})`)
    for (const match of ps) {
      assert(match[1].startsWith(' -a'), `"${match[0].trim()}" carries -a`)
    }
    const ruleset = text
      .split(/\n(?=- )|\n\n/)
      .find((item) => item.includes('Require status checks'))
    assert(ruleset?.includes('pull request'), 'the ruleset bullet says it forces pull requests')
    const row = section('Problemas comuns')
      .split('\n')
      .find((line) => line.includes('healthy') && line.includes('fora do ar'))
    assert(row?.includes('Rollback'), 'Problemas comuns: an unhealthy server means rollback')
    assert(
      /ssh-keyscan[^\n]*> ~\/\.ssh\/bens-known_hosts-staging/.test(text),
      'ssh-keyscan writes ~/.ssh/bens-known_hosts-staging',
    )
    assert(
      /`SSH_KNOWN_HOSTS`[^\n]*bens-known_hosts-staging/.test(text),
      'SSH_KNOWN_HOSTS is the content of that file',
    )
  },
}

const SCRIPT_STEPS = [
  'generate',
  'existing',
  'usage',
  'validate',
  'missing-files',
  'send',
  'corrupt',
  'db-guard',
  'volume-guard',
  'replace',
  'apply',
  'apply-first',
  'apply-fails',
]
const ORDER = [...SCRIPT_STEPS, 'no-leak', 'runbook']

const name = process.argv[2]
const selected = name === 'all' ? ORDER : [name]
if (!name || selected.some((item) => !(item in steps))) {
  fail(`usage: node scripts/env-push-smoke.mjs <all|${ORDER.join('|')}>`)
  process.exit(2)
}
for (const item of selected) {
  out(`# ${item}`)
  try {
    steps[item]()
  } catch (error) {
    fail(`  not ok - ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
rmSync(SCRATCH, { recursive: true, force: true })
