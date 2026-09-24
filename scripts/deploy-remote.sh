#!/usr/bin/env bash
# Runs on the VPS (ADR-008): installs one image tag of the stack in docker-compose.prod.yml.
# Copied next to the compose file by .github/workflows/deploy-environment.yml, then run as
#   IMAGE_REGISTRY=ghcr.io/arturmois/bens-seguros-v2 REGISTRY_USER=<user> ./deploy-remote.sh <tag>
# with the registry token on stdin. A failure before `up` leaves the running version untouched.
# Tutorial: docs/runbooks/deploy.md.
set -euo pipefail

say() { printf 'deploy: %s\n' "$*"; }
die() { printf 'deploy: erro: %s\n' "$*" >&2; exit 1; }

[ "$#" -eq 1 ] || die "uso: deploy-remote.sh <tag>"
tag=$1
# Docker's tag grammar; the workflow already restricts it to sha-<40 hex> or vX.Y.Z.
[[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || die "tag inválida: $tag"

cd "$(dirname "$0")"

[ -f .env ] || die ".env não encontrado em $PWD (crie a partir do .env.prod.example)"
[ "$(stat -c %a .env)" = 600 ] || die ".env precisa de permissão 600 (chmod 600 .env)"
: "${IMAGE_REGISTRY:?IMAGE_REGISTRY não definido}"
: "${REGISTRY_USER:?REGISTRY_USER não definido}"

token=$(cat)
[ -n "$token" ] || die "token do registry ausente no stdin"

registry_host=${IMAGE_REGISTRY%%/*}
next=deploy.env.next
cleanup() {
  docker logout "$registry_host" >/dev/null 2>&1 || true
  rm -f "$next"
}
trap cleanup EXIT

say "login em $registry_host"
printf '%s' "$token" | docker login "$registry_host" --username "$REGISTRY_USER" --password-stdin >/dev/null
unset token

# Pull first: a tag that does not exist fails here, before any container is touched.
for image in migrate server web; do
  say "pull $IMAGE_REGISTRY/$image:$tag"
  docker pull --quiet "$IMAGE_REGISTRY/$image:$tag" >/dev/null \
    || die "não foi possível baixar $IMAGE_REGISTRY/$image:$tag; nada foi alterado"
done

printf 'IMAGE_REGISTRY=%s\nIMAGE_TAG=%s\n' "$IMAGE_REGISTRY" "$tag" > "$next"
compose() { docker compose -f docker-compose.prod.yml --env-file .env --env-file "$next" "$@"; }

# Migrations as the owner, before the server is recreated; a failure keeps the old server up.
say "migrate"
compose run --rm migrate || die "migrate falhou; a versão anterior continua no ar"

say "up"
compose up -d --wait --no-build --remove-orphans

running=$(docker inspect --format '{{.Config.Image}}' "$(compose ps --quiet server)")
[ "$running" = "$IMAGE_REGISTRY/server:$tag" ] || die "server rodando $running, esperado $IMAGE_REGISTRY/server:$tag"

if [ -f deploy.env ]; then cp deploy.env deploy.env.previous; fi
mv "$next" deploy.env
say "ok: $tag"
