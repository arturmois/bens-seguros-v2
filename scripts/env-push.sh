#!/usr/bin/env bash
# Runs on the operator's machine (AD-012): writes .env.<environment> if it does not exist, checks it
# against .env.prod.example and installs it as DEPLOY_PATH/.env on the VPS through the deploy key.
#   scripts/env-push.sh <staging|production> [--apply]
# Tutorial: docs/runbooks/deploy.md.
set -euo pipefail

say() { printf 'env-push: %s\n' "$*"; }
die() { printf 'env-push: erro: %s\n' "$*" >&2; exit 1; }
usage() { printf 'env-push: uso: scripts/env-push.sh <staging|production> [--apply]\n' >&2; exit 1; }

apply=0
case "$#" in
  1) ;;
  2) [ "$2" = --apply ] || usage; apply=1 ;;
  *) usage ;;
esac
environment=$1
case "$environment" in staging | production) ;; *) usage ;; esac

cd "$(dirname "$0")/.."
example=.env.prod.example
file=.env.$environment
[ -f "$example" ] || die "$example não encontrado em $PWD"

# The last KEY= line of a file, without surrounding double quotes.
value() {
  local line
  line=$(grep -E "^$1=" "$2" | tail -n 1) || true
  line=${line#*=}
  line=${line#\"}
  printf '%s' "${line%\"}"
}

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi
}

# ask <prompt> [default]: the prompt goes to stderr, the answer to stdout. ASK_SILENT=1 hides the
# typing (secrets).
ask() {
  local answer
  printf '%s: ' "$1" >&2
  if [ "${ASK_SILENT:-}" = 1 ]; then
    IFS= read -rs answer || true
    printf '\n' >&2
  else
    IFS= read -r answer || true
  fi
  answer=${answer:-${2:-}}
  [ -n "$answer" ] || die "resposta vazia: $1"
  printf '%s' "$answer"
}

# --- generate --------------------------------------------------------------------------------------

if [ ! -f "$file" ]; then
  say "$file não existe; gerando (as senhas são criadas aqui)"
  domain=$(ask "Domínio do $environment (ex.: staging.seudominio.com.br)")
  resend_key=$(ASK_SILENT=1 ask "Chave de API do Resend (re_...)")
  sender=$(ask "Remetente dos e-mails" "nao-responda@${domain#*.}")
  turnstile_site=$(ask "Turnstile: site key")
  turnstile_secret=$(ASK_SILENT=1 ask "Turnstile: secret key")
  postgres_password=$(openssl rand -hex 24)
  app_db_password=$(openssl rand -hex 24)
  auth_secret=$(openssl rand -base64 32)

  generated() {
    case "$1" in
      SITE_ADDRESS) printf '%s' "$domain" ;;
      APP_URL) printf 'https://%s' "$domain" ;;
      HTTP_PORT) printf '80' ;;
      HTTPS_PORT) printf '443' ;;
      POSTGRES_USER | POSTGRES_DB) printf 'bens' ;;
      POSTGRES_PASSWORD) printf '%s' "$postgres_password" ;;
      APP_DB_PASSWORD) printf '%s' "$app_db_password" ;;
      BETTER_AUTH_SECRET) printf '%s' "$auth_secret" ;;
      SMTP_URL) printf 'smtps://resend:%s@smtp.resend.com:465' "$resend_key" ;;
      EMAIL_FROM) printf '"Bens Seguros <%s>"' "$sender" ;;
      LOG_LEVEL) printf 'info' ;;
      SIGNUP_MODE) printf 'self_serve' ;;
      TURNSTILE_SITE_KEY) printf '%s' "$turnstile_site" ;;
      TURNSTILE_SECRET_KEY) printf '%s' "$turnstile_secret" ;;
      *) return 1 ;;
    esac
  }

  # The example's comments and order stay; a key added to it later keeps the example's value and
  # is caught by the checks below.
  (
    umask 077
    while IFS= read -r line || [ -n "$line" ]; do
      if [[ "$line" =~ ^([A-Z_]+)= ]] && v=$(generated "${BASH_REMATCH[1]}"); then
        printf '%s=%s\n' "${BASH_REMATCH[1]}" "$v"
      else
        printf '%s\n' "$line"
      fi
    done <"$example" >"$file"
  )
  say "$file criado; guarde uma cópia dele num gerenciador de senhas"
fi

# --- check -----------------------------------------------------------------------------------------

keys=$(grep -oE '^[A-Z_]+=' "$example" | tr -d =)
for key in $keys; do
  [ -n "$(value "$key" "$file")" ] || die "$key ausente ou vazio em $file"
done
for key in $keys; do
  case "$(value "$key" "$file")" in
    *'<RESEND_API_KEY>'* | *example.com*) die "$key ainda tem o valor de exemplo em $file" ;;
  esac
done
site=$(value SITE_ADDRESS "$file")
[ "$(value APP_URL "$file")" = "https://$site" ] || die "APP_URL precisa ser https://$site"
secret=$(value BETTER_AUTH_SECRET "$file")
[ "${#secret}" -ge 32 ] || die "BETTER_AUTH_SECRET precisa de pelo menos 32 caracteres"
for key in POSTGRES_PASSWORD APP_DB_PASSWORD; do
  [[ "$(value "$key" "$file")" =~ ^[A-Za-z0-9._~-]+$ ]] \
    || die "$key só pode ter letras, números e . _ ~ - (vai dentro da URL do banco)"
done

key_file=${SSH_KEY:-$HOME/.ssh/bens-deploy-$environment}
known_hosts=${SSH_KNOWN_HOSTS_FILE:-$HOME/.ssh/bens-known_hosts-$environment}
[ -f "$key_file" ] || die "chave do deploy não encontrada: $key_file (runbook, \"Chave SSH do deploy\")"
[ -f "$known_hosts" ] || die "host key não encontrada: $known_hosts (runbook, \"Chave SSH do deploy\")"
host=${SSH_HOST:-$(awk '!/^#/ && NF { print $1; exit }' "$known_hosts")}
host=${host%%,*}
user=${SSH_USER:-deploy}
deploy_path=${DEPLOY_PATH:-/opt/bens-seguros}
[[ "$deploy_path" =~ ^/[A-Za-z0-9._/-]+$ ]] || die "DEPLOY_PATH precisa ser um caminho absoluto sem espaços"

ssh_opts=(-i "$key_file" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$known_hosts")
# The remote commands are built here on purpose (the path is checked above).
# shellcheck disable=SC2029
remote() { ssh "${ssh_opts[@]}" "$user@$host" "$1"; }

# --- the database credentials of an existing VPS never change here --------------------------------

remote_env=$(mktemp)
trap 'rm -f "$remote_env"' EXIT
state=0
remote "cd '$deploy_path' || exit 1
if [ -f .env ]; then cat .env; exit 0; fi
if docker volume inspect bens-seguros-prod_postgres-data >/dev/null 2>&1; then exit 3; fi
exit 4" </dev/null >"$remote_env" || state=$?
case "$state" in
  0)
    for key in POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD APP_DB_PASSWORD; do
      [ "$(value "$key" "$remote_env")" = "$(value "$key" "$file")" ] \
        || die "$key difere do .env da VPS; o banco já foi criado com o valor de lá (troca de senha: runbook, \"Operação do dia a dia\")"
    done
    ;;
  3) die "o banco já existe na VPS e ela não tem .env; recupere o .env antigo em vez de gerar outro" ;;
  4) ;;
  *) die "não foi possível ler $deploy_path em $user@$host (saída $state)" ;;
esac

# --- send: the VPS keeps the new file only if its sha256 matches -----------------------------------

hash=$(sha256 <"$file")
remote "cd '$deploy_path' || exit 1
umask 077
cat > .env.push
if [ \"\$(sha256sum < .env.push | cut -d' ' -f1)\" = '$hash' ]; then mv .env.push .env; else rm -f .env.push; exit 3; fi" \
  <"$file" || die "o envio falhou; o .env da VPS não mudou"
say "ok: $file -> $user@$host:$deploy_path/.env"

[ "$apply" = 1 ] || exit 0
state=0
remote "cd '$deploy_path' || exit 1
[ -f deploy.env ] || exit 4
docker compose -f docker-compose.prod.yml --env-file .env --env-file deploy.env up -d --wait --no-build" \
  </dev/null || state=$?
case "$state" in
  0) say "aplicado" ;;
  4) say "a VPS ainda não tem deploy; o primeiro deploy aplica este .env" ;;
  *) die "o .env novo já está na VPS, mas o up falhou (saída $state); veja os logs do server (runbook, \"Problemas comuns\")" ;;
esac
