// Local proof of the deploy (feature `cd-vps`): each step proves checks of
// .specs/features/cd-vps/checks.md. The remote script runs against a real registry with auth and a
// scratch DEPLOY_PATH holding only what the workflow copies; the workflow steps are read as data
// and their `run` scripts executed with the env the workflow gives them.
//   node scripts/deploy-smoke.mjs up        build the images, start the registry, push the tags
//   node scripts/deploy-smoke.mjs <step>    one step; exits 1 on the first failed assertion
//   node scripts/deploy-smoke.mjs all       every step, in order (the script steps build on each other)
//   node scripts/deploy-smoke.mjs down      remove the stack, the registry and the scratch files
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const out = (line) => process.stdout.write(`${line}\n`)
const fail = (line) => process.stderr.write(`${line}\n`)

// Caddy's internal CA signs the local certificate.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const SCRATCH = join(tmpdir(), 'bens-deploy-smoke')
const STATE_FILE = join(SCRATCH, 'state.json')
const DEPLOY = join(SCRATCH, 'deploy')
const GUARD = join(SCRATCH, 'guard')
const STUB = join(SCRATCH, 'stub')
const STUB_CALLS = join(STUB, 'calls')
const TRANSCRIPT = join(SCRATCH, 'transcript.log')
const DOCKER_CONFIG = join(SCRATCH, 'docker-config')
const PUSHER_CONFIG = join(SCRATCH, 'pusher-config')

const PROJECT = 'bens-deploy-smoke'
const REGISTRY_CONTAINER = 'bens-deploy-smoke-registry'
const REGISTRY_HOST = '127.0.0.1:5055'
const REGISTRY = `${REGISTRY_HOST}/bens`
const REGISTRY_USER = 'smoke'
const HTTPS_BASE = 'https://localhost:8543'
const IMAGES = ['migrate', 'server', 'web']
// A made-up commit: the promote steps look up its images.
const FAKE_SHA = 'a'.repeat(40)
const OTHER_SHA = 'b'.repeat(40)
// The files the workflow copies to DEPLOY_PATH (C18), at the same relative paths.
const COPIED = ['docker-compose.prod.yml', 'docker/postgres/init/01-app-role.sh']

function docker(args, options = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', ...options }).trim()
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  out(`  ok - ${message}`)
}

function state() {
  if (!existsSync(STATE_FILE)) throw new Error('run `node scripts/deploy-smoke.mjs up` first')
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
}

function saveState(patch) {
  writeFileSync(STATE_FILE, JSON.stringify({ ...state(), ...patch }))
}

// The deploy stack's containers, by the labels Compose puts on them.
function containerId(service, all = false) {
  return docker([
    'ps',
    ...(all ? ['-a'] : []),
    '-q',
    '--latest',
    '--filter',
    `label=com.docker.compose.project=${PROJECT}`,
    '--filter',
    `label=com.docker.compose.service=${service}`,
  ])
}

const imageOf = (id) => docker(['inspect', '--format', '{{.Config.Image}}', id])

function registryAuths() {
  const file = join(DOCKER_CONFIG, 'config.json')
  if (!existsSync(file)) return []
  return Object.keys(JSON.parse(readFileSync(file, 'utf8')).auths ?? {})
}

// scripts/deploy-remote.sh as the workflow runs it; every output goes to the transcript (C14).
function deploy(
  tag,
  { dir = DEPLOY, input = state().password, path = process.env.PATH, env = {} } = {},
) {
  const result = spawnSync(join(dir, 'deploy-remote.sh'), [tag], {
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      PATH: path,
      IMAGE_REGISTRY: REGISTRY,
      REGISTRY_USER,
      DOCKER_CONFIG,
      COMPOSE_PROJECT_NAME: PROJECT,
      ...env,
    },
  })
  const output = `${result.stdout}${result.stderr}`
  appendFileSync(TRANSCRIPT, `$ deploy-remote.sh ${tag}\n${output}\n`)
  return { status: result.status, output }
}

function deployEnv(file = 'deploy.env') {
  return readFileSync(join(DEPLOY, file), 'utf8')
}

function workflow(file) {
  const json = execFileSync(
    'docker',
    ['run', '--rm', '-i', 'mikefarah/yq:4', '-o=json', '.', '-'],
    {
      encoding: 'utf8',
      input: readFileSync(file, 'utf8'),
    },
  )
  return JSON.parse(json)
}

const DEPLOY_YML = '.github/workflows/deploy.yml'
const ENVIRONMENT_YML = '.github/workflows/deploy-environment.yml'

function step(job, name) {
  const found = job.steps.find((item) => item.name === name)
  if (!found) throw new Error(`step "${name}" not found`)
  return found
}

// A step's `run` the way GitHub runs it (bash --noprofile --norc -eo pipefail).
function runStep(run, env, cwd = process.cwd()) {
  const output = join(SCRATCH, 'github-output')
  writeFileSync(output, '')
  const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', run], {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DOCKER_CONFIG,
      GITHUB_OUTPUT: output,
      ...env,
    },
  })
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    outputs: readFileSync(output, 'utf8'),
  }
}

// Bash lines with their `\` continuations joined.
function commands(run) {
  return run.replace(/\\\n\s*/g, ' ').split('\n')
}

function digest(ref) {
  const inspect = docker(['buildx', 'imagetools', 'inspect', ref], {
    env: { ...process.env, DOCKER_CONFIG },
  })
  return inspect.match(/^Digest:\s+(\S+)/m)?.[1]
}

function writeDeployDir(dir, withEnv) {
  rmSync(dir, { recursive: true, force: true })
  for (const file of COPIED) {
    mkdirSync(join(dir, dirname(file)), { recursive: true })
    copyFileSync(file, join(dir, file))
  }
  copyFileSync('scripts/deploy-remote.sh', join(dir, 'deploy-remote.sh'))
  chmodSync(join(dir, 'deploy-remote.sh'), 0o755)
  chmodSync(join(dir, 'docker/postgres/init/01-app-role.sh'), 0o755)
  if (!withEnv) return
  const secret = () => randomBytes(24).toString('hex')
  writeFileSync(
    join(dir, '.env'),
    [
      '# Generated by scripts/deploy-smoke.mjs: local validation only.',
      'SITE_ADDRESS=localhost',
      'HTTP_PORT=8180',
      'HTTPS_PORT=8543',
      `APP_URL=${HTTPS_BASE}`,
      'POSTGRES_USER=bens',
      `POSTGRES_PASSWORD=${secret()}`,
      'POSTGRES_DB=bens',
      `APP_DB_PASSWORD=${secret()}`,
      `BETTER_AUTH_SECRET=${secret()}`,
      'SMTP_URL=smtp://127.0.0.1:1025',
      'EMAIL_FROM="Bens Seguros <nao-responda@bensseguros.local>"',
      'LOG_LEVEL=warn',
      'SIGNUP_MODE=self_serve',
      'TURNSTILE_SITE_KEY=1x00000000000000000000AA',
      'TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA',
      '',
    ].join('\n'),
  )
  chmodSync(join(dir, '.env'), 0o600)
}

function removeStack() {
  const ids = docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${PROJECT}`])
  if (ids) docker(['rm', '--force', ...ids.split('\n')])
  const volumes = docker([
    'volume',
    'ls',
    '-q',
    '--filter',
    `label=com.docker.compose.project=${PROJECT}`,
  ])
  if (volumes) docker(['volume', 'rm', ...volumes.split('\n')])
  const networks = docker([
    'network',
    'ls',
    '-q',
    '--filter',
    `label=com.docker.compose.project=${PROJECT}`,
  ])
  if (networks) docker(['network', 'rm', ...networks.split('\n')])
}

// A failed deploy must leave these exactly as they were (C9, C10, C39): same container, never
// stopped or restarted (same start time), and the same deploy.env.
const RUNNING = ['server', 'caddy', 'postgres']

function snapshot() {
  const containers = Object.fromEntries(
    RUNNING.map((service) => {
      const id = containerId(service)
      return [service, `${id} ${docker(['inspect', '--format', '{{.State.StartedAt}}', id])}`]
    }),
  )
  return { containers, server: containerId('server'), deployEnv: deployEnv() }
}

function assertUntouched(before, label) {
  const after = snapshot()
  for (const service of RUNNING) {
    assert(
      after.containers[service] === before.containers[service],
      `${label}: the ${service} container is the same and was not restarted`,
    )
  }
  assert(
    imageOf(after.server) === `${REGISTRY}/server:tag-b`,
    `${label}: the server still runs tag-b`,
  )
  assert(after.deployEnv === before.deployEnv, `${label}: deploy.env is byte-identical`)
  assert(!registryAuths().includes(REGISTRY_HOST), `${label}: no credential left for the registry`)
}

async function health(base = HTTPS_BASE) {
  const response = await fetch(`${base}/api/health`)
  return response.status
}

const steps = {
  async up() {
    await steps.down()
    mkdirSync(SCRATCH, { recursive: true })
    const password = randomBytes(24).toString('hex')
    writeFileSync(STATE_FILE, JSON.stringify({ password }))
    writeFileSync(TRANSCRIPT, '')

    out('  building the images')
    docker([
      'build',
      '-q',
      '-f',
      'apps/server/Dockerfile',
      '--target',
      'runtime',
      '-t',
      'bens-seguros/server:local',
      '.',
    ])
    docker([
      'build',
      '-q',
      '-f',
      'apps/server/Dockerfile',
      '--target',
      'migrate',
      '-t',
      'bens-seguros/migrate:local',
      '.',
    ])
    docker(['build', '-q', '-f', 'apps/web/Dockerfile', '-t', 'bens-seguros/web:local', '.'])

    mkdirSync(join(SCRATCH, 'auth'), { recursive: true })
    writeFileSync(
      join(SCRATCH, 'auth/htpasswd'),
      docker([
        'run',
        '--rm',
        '--entrypoint',
        'htpasswd',
        'httpd:2.4-alpine',
        '-Bbn',
        REGISTRY_USER,
        password,
      ]),
    )
    docker([
      'run',
      '-d',
      '--name',
      REGISTRY_CONTAINER,
      '-p',
      `${REGISTRY_HOST}:5000`,
      '-v',
      `${join(SCRATCH, 'auth')}:/auth:ro`,
      '-e',
      'REGISTRY_AUTH=htpasswd',
      '-e',
      'REGISTRY_AUTH_HTPASSWD_REALM=smoke',
      '-e',
      'REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd',
      'registry:3',
    ])

    const pusher = { env: { ...process.env, DOCKER_CONFIG: PUSHER_CONFIG } }
    for (let i = 0; ; i++) {
      const login = spawnSync(
        'docker',
        ['login', REGISTRY_HOST, '--username', REGISTRY_USER, '--password-stdin'],
        { input: password, encoding: 'utf8', ...pusher },
      )
      if (login.status === 0) break
      if (i === 20) throw new Error(`registry login: ${login.stderr}`)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const push = (ref) => {
      docker(['push', '-q', ref], pusher)
      docker(['rmi', ref])
    }
    for (const image of IMAGES) {
      for (const tag of ['tag-a', 'tag-b', `sha-${FAKE_SHA}`]) {
        docker(['tag', `bens-seguros/${image}:local`, `${REGISTRY}/${image}:${tag}`])
        push(`${REGISTRY}/${image}:${tag}`)
      }
    }
    // tag-bad: the server and the web of tag-a, a migrate that exits 3 (C10).
    docker(['tag', 'bens-seguros/migrate:local', `${REGISTRY}/migrate:base`])
    docker(['build', '-q', '-t', `${REGISTRY}/migrate:tag-bad`, '-'], {
      input: `FROM ${REGISTRY}/migrate:base\nCMD ["node", "-e", "process.exit(3)"]\n`,
    })
    docker(['rmi', `${REGISTRY}/migrate:base`])
    push(`${REGISTRY}/migrate:tag-bad`)
    for (const image of ['server', 'web']) {
      docker(['tag', `bens-seguros/${image}:local`, `${REGISTRY}/${image}:tag-bad`])
      push(`${REGISTRY}/${image}:tag-bad`)
    }

    writeDeployDir(DEPLOY, true)
    mkdirSync(STUB, { recursive: true })
    writeFileSync(join(STUB, 'docker'), `#!/bin/sh\necho "$@" >> '${STUB_CALLS}'\nexit 1\n`)
    chmodSync(join(STUB, 'docker'), 0o755)
    out(`  registry at ${REGISTRY_HOST}, deploy dir ${DEPLOY}`)
  },

  async down() {
    removeStack()
    spawnSync('docker', ['rm', '--force', REGISTRY_CONTAINER])
    rmSync(SCRATCH, { recursive: true, force: true })
  },

  // C1
  async 'workflow-build-guard'() {
    const deploy = workflow(DEPLOY_YML)
    const conjuncts = deploy.jobs.build.if.split('&&').map((part) => part.trim())
    for (const expected of [
      "github.event_name == 'workflow_run'",
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.event == 'push'",
      "github.event.workflow_run.head_branch == 'main'",
      'github.event.workflow_run.head_repository.full_name == github.repository',
    ]) {
      assert(conjuncts.includes(expected), `build.if has the conjunct ${expected}`)
    }
    assert(conjuncts.length === 5, 'build.if has exactly those five conjuncts')
    const trigger = deploy.on.workflow_run
    assert(
      JSON.stringify(trigger) ===
        JSON.stringify({ workflows: ['CI'], types: ['completed'], branches: ['main'] }),
      'on.workflow_run is CI, completed, main',
    )
  },

  // C2
  async 'workflow-build-images'() {
    const deploy = workflow(DEPLOY_YML)
    assert(
      deploy.env.IMAGE_REGISTRY === 'ghcr.io/arturmois/bens-seguros-v2',
      'IMAGE_REGISTRY is ghcr.io/arturmois/bens-seguros-v2',
    )
    const buildSteps = deploy.jobs.build.steps
    const checkout = buildSteps.find((item) => item.uses?.startsWith('actions/checkout@'))
    assert(
      checkout?.with?.ref === `\${{ github.event.workflow_run.head_sha }}`,
      'checks out github.event.workflow_run.head_sha',
    )
    const pushes = buildSteps.filter((item) => item.uses?.startsWith('docker/build-push-action@'))
    assert(pushes.length === 3, 'three build-push steps')
    const expected = {
      server: { file: 'apps/server/Dockerfile', target: 'runtime' },
      migrate: { file: 'apps/server/Dockerfile', target: 'migrate' },
      web: { file: 'apps/web/Dockerfile', target: undefined },
    }
    for (const [image, { file, target }] of Object.entries(expected)) {
      const tags = `\${{ env.IMAGE_REGISTRY }}/${image}:sha-\${{ github.event.workflow_run.head_sha }}`
      const found = pushes.find((item) => item.with.tags === tags)
      assert(found !== undefined, `${image} is pushed only as sha-<head_sha>`)
      assert(
        found.with.context === '.' &&
          found.with.file === file &&
          found.with.target === target &&
          found.with.platforms === 'linux/amd64' &&
          found.with.push === true,
        `${image}: context ., ${file}, target ${target ?? '(default)'}, linux/amd64, push`,
      )
    }
  },

  // C3
  async 'workflow-permissions'() {
    const deploy = workflow(DEPLOY_YML)
    assert(JSON.stringify(deploy.permissions) === '{}', 'top-level permissions are {}')
    assert(
      JSON.stringify(deploy.jobs.build.permissions) ===
        JSON.stringify({ contents: 'read', packages: 'write' }),
      'build asks for exactly contents: read and packages: write',
    )
  },

  // C4
  async 'workflow-actions'() {
    const allowed = new Set([
      'actions/checkout@v7',
      'docker/setup-buildx-action@v4',
      'docker/login-action@v4',
      'docker/build-push-action@v7',
      './.github/workflows/deploy-environment.yml',
    ])
    const used = []
    for (const file of [DEPLOY_YML, ENVIRONMENT_YML]) {
      for (const job of Object.values(workflow(file).jobs)) {
        if (job.uses) used.push(job.uses)
        for (const item of job.steps ?? []) if (item.uses) used.push(item.uses)
      }
    }
    const foreign = used.filter((uses) => !allowed.has(uses))
    assert(
      used.length > 0 && foreign.length === 0,
      `only allowed actions (${[...new Set(used)].join(', ')})`,
    )
  },

  // C17, C29, C30, C32
  async 'workflow-callers'() {
    const deploy = workflow(DEPLOY_YML)
    const reusable = './.github/workflows/deploy-environment.yml'
    const callers = {
      'deploy-staging': {
        needs: 'build',
        with: {
          environment: 'staging',
          image_tag: `sha-\${{ github.event.workflow_run.head_sha }}`,
          ref: `\${{ github.event.workflow_run.head_sha }}`,
        },
      },
      'deploy-production': {
        needs: 'promote',
        with: {
          environment: 'production',
          image_tag: `\${{ github.ref_name }}`,
          ref: `\${{ github.ref_name }}`,
        },
      },
      redeploy: {
        needs: 'resolve',
        with: {
          environment: `\${{ inputs.environment }}`,
          image_tag: `\${{ inputs.image_tag }}`,
          ref: `\${{ needs.resolve.outputs.ref }}`,
        },
      },
    }
    for (const [name, expected] of Object.entries(callers)) {
      const job = deploy.jobs[name]
      assert(job.uses === reusable, `${name} calls deploy-environment.yml`)
      assert(job.needs === expected.needs, `${name} needs ${expected.needs}`)
      assert(
        JSON.stringify(job.with) === JSON.stringify(expected.with),
        `${name} passes ${JSON.stringify(expected.with)}`,
      )
    }
    const inputs = deploy.on.workflow_dispatch.inputs
    assert(
      inputs.environment.type === 'choice' &&
        JSON.stringify(inputs.environment.options) === '["staging","production"]' &&
        inputs.environment.required === true,
      'dispatch input environment: choice of staging, production, required',
    )
    assert(
      inputs.image_tag.type === 'string' && inputs.image_tag.required === true,
      'dispatch input image_tag: string, required',
    )
    assert(Object.keys(inputs).length === 2, 'dispatch has exactly those two inputs')
    const resolve = deploy.jobs.resolve
    assert(resolve.if === "github.event_name == 'workflow_dispatch'", 'resolve runs on dispatch')
    const names = resolve.steps.map((item) => item.name)
    assert(
      names.includes('Image tag format') && names.includes('Image tag exists'),
      'resolve checks the format and the existence of the tag',
    )
    const remote = resolve.steps.filter((item) => /\b(ssh|scp)\b/.test(item.run ?? ''))
    assert(remote.length === 0, 'resolve opens no SSH connection')
  },

  // C18, C19
  async 'workflow-remote-steps'() {
    const job = workflow(ENVIRONMENT_YML).jobs.deploy
    assert(
      job.environment.name === `\${{ inputs.environment }}`,
      'environment.name is inputs.environment',
    )
    assert(job.env.IMAGE_REGISTRY === 'ghcr.io/arturmois/bens-seguros-v2', 'IMAGE_REGISTRY is GHCR')
    const checkout = job.steps.find((item) => item.uses?.startsWith('actions/checkout@'))
    assert(checkout?.with?.ref === `\${{ inputs.ref }}`, 'checks out inputs.ref')
    const install = step(job, 'Copy the files and install the tag')
    const lines = commands(install.run)
    const copied = lines
      .filter((line) => /^\s*scp /.test(line))
      .flatMap((line) => {
        const words = line.trim().split(/\s+/)
        const sources = words.slice(2, -1).filter((word) => !word.startsWith('-'))
        const destination = words.at(-1).replace(/^"\$target:\$DEPLOY_PATH\/|"$/g, '')
        return sources.map((source) => ({ source, destination }))
      })
    assert(
      JSON.stringify(copied.map(({ source }) => source).sort()) ===
        JSON.stringify([
          'docker-compose.prod.yml',
          'docker/postgres/init/01-app-role.sh',
          'scripts/deploy-remote.sh',
        ]),
      'copies exactly the compose file, the role script and deploy-remote.sh',
    )
    for (const { source, destination } of copied) {
      const expected =
        source === 'scripts/deploy-remote.sh'
          ? ''
          : dirname(source) === '.'
            ? ''
            : `${dirname(source)}/`
      assert(destination === expected, `${source} lands at DEPLOY_PATH/${expected}`)
    }
    const run = lines.find((line) => line.includes('deploy-remote.sh') && !/^\s*scp /.test(line))
    assert(
      run?.includes(`cd '$DEPLOY_PATH' && IMAGE_REGISTRY='$IMAGE_REGISTRY'`) &&
        run.includes(`./deploy-remote.sh '$IMAGE_TAG'`),
      'runs ./deploy-remote.sh "$IMAGE_TAG" in DEPLOY_PATH with IMAGE_REGISTRY',
    )
    assert(
      /^\s*printf '%s' "\$REGISTRY_TOKEN" \| ssh /.test(run),
      'pipes "$REGISTRY_TOKEN" into ssh on stdin',
    )
    assert(install.env.REGISTRY_TOKEN === `\${{ github.token }}`, 'REGISTRY_TOKEN is the job token')
    for (const file of [DEPLOY_YML, ENVIRONMENT_YML]) {
      for (const job of Object.values(workflow(file).jobs)) {
        for (const item of job.steps ?? []) {
          for (const line of commands(item.run ?? '')) {
            const at = line.search(/\b(ssh|scp) /)
            if (at < 0) continue
            const command = line.slice(at)
            assert(
              !command.includes('TOKEN') && !command.includes('github.token'),
              `no token on the command line: ${command.slice(0, 40)}…`,
            )
          }
        }
      }
    }
  },

  // C20
  async 'workflow-ssh-options'() {
    const job = workflow(ENVIRONMENT_YML).jobs.deploy
    const keys = step(job, 'SSH key and host key')
    assert(
      keys.env.SSH_KNOWN_HOSTS === `\${{ secrets.SSH_KNOWN_HOSTS }}` &&
        keys.run.includes(`printf '%s\\n' "$SSH_KNOWN_HOSTS" > ~/.ssh/deploy_known_hosts`),
      'secrets.SSH_KNOWN_HOSTS is written to ~/.ssh/deploy_known_hosts',
    )
    const install = step(job, 'Copy the files and install the tag').run
    const lines = commands(install)
    const options = install.match(/ssh_opts=\(([^)]*)\)/)?.[1].replace(/\s+/g, ' ')
    assert(
      options?.includes('-o StrictHostKeyChecking=yes') &&
        options.includes('-o UserKnownHostsFile="$HOME/.ssh/deploy_known_hosts"'),
      'ssh_opts has StrictHostKeyChecking=yes and the pinned known_hosts file',
    )
    const invocations = lines.filter((line) => /\b(ssh|scp) /.test(line))
    assert(invocations.length === 4, 'four ssh/scp invocations')
    for (const line of invocations) {
      assert(
        /\b(ssh|scp) "\$\{ssh_opts\[@\]\}"/.test(line),
        `uses ssh_opts: ${line.trim().slice(0, 50)}…`,
      )
    }
    for (const file of [DEPLOY_YML, ENVIRONMENT_YML]) {
      const text = readFileSync(file, 'utf8')
      assert(
        !/StrictHostKeyChecking=(no|accept-new)/.test(text),
        `${file} never disables host key checking`,
      )
    }
  },

  // C23
  async 'workflow-concurrency'() {
    const job = workflow(ENVIRONMENT_YML).jobs.deploy
    assert(
      JSON.stringify(job.concurrency) ===
        JSON.stringify({ group: `deploy-\${{ inputs.environment }}`, 'cancel-in-progress': false }),
      'concurrency group deploy-<environment>, cancel-in-progress false',
    )
  },

  // C24
  async 'workflow-promote-guard'() {
    const deploy = workflow(DEPLOY_YML)
    assert(
      deploy.jobs.promote.if ===
        "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')",
      'promote runs only on a pushed v* tag',
    )
    assert(
      JSON.stringify(deploy.on.push) === JSON.stringify({ tags: ['v*'] }),
      'on.push is tags v* and no branches',
    )
  },

  // C25
  async 'release-tag-step'() {
    const { run } = step(workflow(DEPLOY_YML).jobs.promote, 'Release tag format')
    for (const tag of ['v1.2.3', 'v10.0.12']) {
      assert(runStep(run, { RELEASE_TAG: tag }).status === 0, `accepts ${tag}`)
    }
    for (const tag of ['v1.2', '1.2.3', 'v1.2.3-rc.1', 'V1.2.3']) {
      assert(runStep(run, { RELEASE_TAG: tag }).status !== 0, `rejects ${tag}`)
    }
  },

  // C31
  async 'image-tag-step'() {
    const { run } = step(workflow(DEPLOY_YML).jobs.resolve, 'Image tag format')
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const accepted = runStep(run, { IMAGE_TAG: `sha-${sha}` })
    assert(
      accepted.status === 0 && accepted.outputs === `ref=${sha}\n`,
      `accepts sha-<40 hex>, ref ${sha}`,
    )
    const version = runStep(run, { IMAGE_TAG: 'v1.2.3' })
    assert(version.status === 0 && version.outputs === 'ref=v1.2.3\n', 'accepts v1.2.3, ref v1.2.3')
    for (const tag of [
      'sha-abc1234',
      `sha-${sha.toUpperCase()}`,
      'v1.2',
      'latest',
      'v1.2.3; id',
      '',
    ]) {
      const result = runStep(run, { IMAGE_TAG: tag })
      assert(result.status !== 0 && result.outputs === '', `rejects "${tag}"`)
    }
  },

  // C26
  async 'on-main-step'() {
    const promote = workflow(DEPLOY_YML).jobs.promote
    const { run } = step(promote, 'Tag commit is on main')
    const repo = join(SCRATCH, 'git')
    rmSync(repo, { recursive: true, force: true })
    mkdirSync(repo, { recursive: true })
    const git = (...args) =>
      execFileSync(
        'git',
        ['-c', 'user.name=smoke', '-c', 'user.email=smoke@example.com', ...args],
        {
          cwd: repo,
          encoding: 'utf8',
        },
      ).trim()
    git('init', '-q', '-b', 'main')
    git('commit', '-q', '--allow-empty', '-m', 'on main')
    git('tag', '-a', 'v1.0.0', '-m', 'release')
    git('switch', '-q', '-c', 'side')
    git('commit', '-q', '--allow-empty', '-m', 'off main')
    git('tag', 'v1.0.1')
    git('update-ref', 'refs/remotes/origin/main', 'main')
    const onMain = runStep(run, { RELEASE_TAG: 'v1.0.0' }, repo)
    assert(
      onMain.status === 0 && onMain.outputs === `sha=${git('rev-parse', 'main')}\n`,
      'a tag on a commit of origin/main passes and outputs its commit',
    )
    assert(runStep(run, { RELEASE_TAG: 'v1.0.1' }, repo).status !== 0, 'a tag off main fails')
    const names = promote.steps.map((item) => item.name)
    const retagAt = promote.steps.findIndex((item) => item.run?.includes('imagetools create'))
    assert(
      retagAt > names.indexOf('Tag commit is on main'),
      'the on-main check runs before imagetools create',
    )
  },

  // C22
  async 'preflight-step'() {
    const { run } = step(workflow(ENVIRONMENT_YML).jobs.deploy, 'Preflight')
    const full = {
      DEPLOY_ENVIRONMENT: 'staging',
      SSH_HOST: '203.0.113.10',
      SSH_USER: 'deploy',
      SSH_PRIVATE_KEY: 'key',
      SSH_KNOWN_HOSTS: 'known',
      DEPLOY_PATH: '/opt/bens-seguros',
      SITE_URL: 'https://staging.example.com',
    }
    assert(runStep(run, full).status === 0, 'passes with the six set')
    for (const name of [
      'SSH_HOST',
      'SSH_USER',
      'SSH_PRIVATE_KEY',
      'SSH_KNOWN_HOSTS',
      'DEPLOY_PATH',
      'SITE_URL',
    ]) {
      const result = runStep(run, { ...full, [name]: '' })
      assert(
        result.status !== 0 && result.output.includes(name),
        `fails and names ${name} when empty`,
      )
    }
    // C37
    for (const url of ['http://staging.example.com', 'staging.example.com']) {
      const result = runStep(run, { ...full, SITE_URL: url })
      assert(
        result.status !== 0 && result.output.includes('SITE_URL precisa começar com https://'),
        `rejects SITE_URL=${url}`,
      )
    }
  },

  // C27, C32
  async 'images-exist-step'() {
    const deploy = workflow(DEPLOY_YML)
    const promote = step(deploy.jobs.promote, 'Images exist').run
    const env = { IMAGE_REGISTRY: REGISTRY }
    login()
    try {
      assert(
        runStep(promote, { ...env, SOURCE_TAG: `sha-${FAKE_SHA}` }).status === 0,
        'promote: passes when the three sha images exist',
      )
      const missing = runStep(promote, { ...env, SOURCE_TAG: `sha-${OTHER_SHA}` })
      assert(
        missing.status === 1 &&
          missing.output
            .split('\n')
            .includes(
              `::error::Imagens sha-${OTHER_SHA} não encontradas: o CI deste commit passou em main?`,
            ),
        'promote: exits 1 with the message when they do not',
      )
      const resolve = step(deploy.jobs.resolve, 'Image tag exists').run
      assert(
        runStep(resolve, { ...env, IMAGE_TAG: 'tag-a' }).status === 0,
        'resolve: an existing tag passes',
      )
      assert(
        runStep(resolve, { ...env, IMAGE_TAG: 'tag-missing' }).status !== 0,
        'resolve: a missing tag fails',
      )
    } finally {
      logout()
    }
  },

  // C28
  async 'retag-step'() {
    const { run } = step(workflow(DEPLOY_YML).jobs.promote, 'Retag')
    login()
    try {
      const result = runStep(run, {
        IMAGE_REGISTRY: REGISTRY,
        SOURCE_TAG: `sha-${FAKE_SHA}`,
        RELEASE_TAG: 'v9.9.9',
      })
      assert(result.status === 0, 'the retag step exits 0')
      for (const image of IMAGES) {
        const source = digest(`${REGISTRY}/${image}:sha-${FAKE_SHA}`)
        assert(
          source !== undefined && digest(`${REGISTRY}/${image}:v9.9.9`) === source,
          `${image}:v9.9.9 has the digest of sha-<SHA> (${source?.slice(0, 19)}…)`,
        )
      }
    } finally {
      logout()
    }
  },

  // C11, C12
  async 'env-guard'() {
    writeDeployDir(GUARD, false)
    const stubbed = `${STUB}:${process.env.PATH}`
    const noCalls = () => !existsSync(STUB_CALLS)
    rmSync(STUB_CALLS, { force: true })
    const absent = deploy('tag-a', { dir: GUARD, path: stubbed })
    assert(absent.status !== 0 && absent.output.includes('.env'), 'no .env: fails and names .env')
    assert(noCalls(), 'no .env: docker was not called')
    writeFileSync(join(GUARD, '.env'), 'POSTGRES_USER=bens\n')
    chmodSync(join(GUARD, '.env'), 0o644)
    const open = deploy('tag-a', { dir: GUARD, path: stubbed })
    assert(open.status !== 0 && open.output.includes('.env'), '.env at 644: fails and names .env')
    assert(noCalls(), '.env at 644: docker was not called')
    chmodSync(join(GUARD, '.env'), 0o600)
    const noToken = deploy('tag-a', { dir: GUARD, path: stubbed, input: '' })
    assert(
      noToken.status !== 0 && noToken.output.includes('token'),
      'empty stdin: fails and names the token',
    )
    assert(noCalls(), 'empty stdin: docker was not called')
  },

  // C6, C13
  async first() {
    const result = deploy('tag-a')
    assert(
      result.status === 0,
      `deploy tag-a exits 0${result.status === 0 ? '' : `\n${result.output}`}`,
    )
    for (const [service, image] of [
      ['server', 'server'],
      ['caddy', 'web'],
      ['migrate', 'migrate'],
    ]) {
      assert(
        imageOf(containerId(service, true)) === `${REGISTRY}/${image}:tag-a`,
        `${service} runs ${image}:tag-a`,
      )
    }
    assert((await health()) === 200, `${HTTPS_BASE}/api/health answers 200`)
    assert(!registryAuths().includes(REGISTRY_HOST), 'no credential left for the registry')
    saveState({ postgres: containerId('postgres') })
  },

  // C7
  async second() {
    const result = deploy('tag-b')
    assert(result.status === 0, 'deploy tag-b exits 0')
    const current = deployEnv()
    const previous = deployEnv('deploy.env.previous')
    assert(current.includes('IMAGE_TAG=tag-b\n'), 'deploy.env holds IMAGE_TAG=tag-b')
    assert(previous.includes('IMAGE_TAG=tag-a\n'), 'deploy.env.previous holds IMAGE_TAG=tag-a')
    for (const file of [current, previous]) {
      assert(file.includes(`IMAGE_REGISTRY=${REGISTRY}\n`), `IMAGE_REGISTRY=${REGISTRY}`)
    }
    assert(imageOf(containerId('server')) === `${REGISTRY}/server:tag-b`, 'the server runs tag-b')
    assert(containerId('postgres') === state().postgres, 'the postgres container is the same')
  },

  // C8
  async 'same-tag'() {
    const result = deploy('tag-b')
    assert(result.status === 0, 'deploy tag-b again exits 0')
    assert(containerId('postgres') === state().postgres, 'the postgres container is the same')
  },

  // C9, C13
  async 'missing-tag'() {
    const before = snapshot()
    const result = deploy('tag-missing')
    assert(result.status !== 0, 'deploy tag-missing exits non-zero')
    assertUntouched(before, 'missing tag')
  },

  // C10, C13
  async 'bad-migrate'() {
    const before = snapshot()
    const result = deploy('tag-bad')
    assert(result.status !== 0, 'deploy tag-bad (migrate exits 3) exits non-zero')
    assertUntouched(before, 'failed migrate')
  },

  // C15
  async rollback() {
    const result = deploy('tag-a')
    assert(result.status === 0, 'deploy tag-a after tag-b exits 0')
    assert(imageOf(containerId('server')) === `${REGISTRY}/server:tag-a`, 'the server runs tag-a')
    assert(deployEnv().includes('IMAGE_TAG=tag-a\n'), 'deploy.env holds IMAGE_TAG=tag-a')
    assert(
      deployEnv('deploy.env.previous').includes('IMAGE_TAG=tag-b\n'),
      'deploy.env.previous holds IMAGE_TAG=tag-b',
    )
  },

  // C38: a stale IMAGE_TAG in the SSH session beats the env files, so `up` keeps the old image;
  // the check of the running image is what stops the script from recording the wrong version.
  async 'image-mismatch'() {
    const before = deployEnv()
    const result = deploy('tag-b', { env: { IMAGE_TAG: 'tag-a' } })
    assert(
      result.status !== 0 && result.output.includes(`esperado ${REGISTRY}/server:tag-b`),
      'deploy tag-b with IMAGE_TAG=tag-a in the environment fails on the image check',
    )
    assert(deployEnv() === before, 'deploy.env is byte-identical')
    assert(
      imageOf(containerId('server')) === `${REGISTRY}/server:tag-a`,
      'the server still runs tag-a',
    )
  },

  // C21, C36
  async 'health-step'() {
    const { run } = step(workflow(ENVIRONMENT_YML).jobs.deploy, 'Health check')
    const ca = join(SCRATCH, 'caddy-root.crt')
    docker(['cp', `${containerId('caddy')}:/data/caddy/pki/authorities/local/root.crt`, ca])
    const live = runStep(run, { SITE_URL: `${HTTPS_BASE}/`, CURL_CA_BUNDLE: ca })
    assert(live.status === 0, `passes against ${HTTPS_BASE}`)
    // C36: Caddy answers http:// with a 308 to https://, which is not the health of the server.
    const redirect = runStep(run, { SITE_URL: 'http://localhost:8180', CURL_CA_BUNDLE: ca })
    assert(
      redirect.status !== 0 && redirect.output.includes('308'),
      'fails against the 308 of http:// and prints the status',
    )
    const started = Date.now()
    const closed = runStep(run, { SITE_URL: 'http://127.0.0.1:9', CURL_CA_BUNDLE: ca })
    const seconds = (Date.now() - started) / 1000
    assert(
      closed.status !== 0 && seconds <= 75,
      `fails against a closed port in ${seconds.toFixed(0)}s`,
    )
  },

  // C14
  async 'no-leak'() {
    const transcript = readFileSync(TRANSCRIPT, 'utf8')
    assert(transcript.includes('deploy-remote.sh tag-a'), 'the transcript has the script runs')
    assert(!transcript.includes(state().password), 'no output contains the registry password')
  },
}

function login() {
  const result = spawnSync(
    'docker',
    ['login', REGISTRY_HOST, '--username', REGISTRY_USER, '--password-stdin'],
    { input: state().password, encoding: 'utf8', env: { ...process.env, DOCKER_CONFIG } },
  )
  if (result.status !== 0) throw new Error(`registry login: ${result.stderr}`)
}

function logout() {
  spawnSync('docker', ['logout', REGISTRY_HOST], { env: { ...process.env, DOCKER_CONFIG } })
}

const ORDER = [
  'workflow-build-guard',
  'workflow-build-images',
  'workflow-permissions',
  'workflow-actions',
  'workflow-callers',
  'workflow-remote-steps',
  'workflow-ssh-options',
  'workflow-concurrency',
  'workflow-promote-guard',
  'release-tag-step',
  'image-tag-step',
  'on-main-step',
  'preflight-step',
  'images-exist-step',
  'retag-step',
  'env-guard',
  'first',
  'second',
  'same-tag',
  'missing-tag',
  'bad-migrate',
  'rollback',
  'image-mismatch',
  'health-step',
  'no-leak',
]

const name = process.argv[2]
const selected = name === 'all' ? ORDER : [name]
if (!name || selected.some((item) => !(item in steps))) {
  fail(`usage: node scripts/deploy-smoke.mjs <up|down|all|${ORDER.join('|')}>`)
  process.exit(2)
}
for (const item of selected) {
  out(`# ${item}`)
  try {
    await steps[item]()
  } catch (error) {
    fail(`  not ok - ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
