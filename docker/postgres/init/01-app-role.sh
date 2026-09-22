#!/bin/sh
# Application role for the server, the tests and pg-boss (ADR-004): neither superuser nor BYPASSRLS
# and owner of no application table, so row level security always applies to it. The owner
# (POSTGRES_USER) runs only the Prisma migrations.
#
# Runs on a fresh volume (docker-entrypoint-initdb.d, as POSTGRES_USER on POSTGRES_DB) and by hand
# on an existing database with PROVISION_DATABASE_URL (the owner's URL). Idempotent: a second run
# only changes the password to APP_DB_PASSWORD.
set -eu

if [ -z "${APP_DB_PASSWORD:-}" ]; then
  echo "APP_DB_PASSWORD is required: the password of the bens_app role" >&2
  exit 1
fi

if [ -n "${PROVISION_DATABASE_URL:-}" ]; then
  set -- "$PROVISION_DATABASE_URL"
else
  set -- --username "${POSTGRES_USER:-postgres}" --dbname "${POSTGRES_DB:-postgres}"
fi

# psql variables are not expanded inside dollar-quoted blocks, so the statements are built with
# format() and run with \gexec.
psql -v ON_ERROR_STOP=1 -v app_password="$APP_DB_PASSWORD" "$@" <<'SQL'
SELECT 'CREATE ROLE bens_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bens_app') \gexec
ALTER ROLE bens_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD :'app_password';
-- CREATE: pg-boss creates and owns its own schema.
SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO bens_app', current_database()) \gexec

GRANT USAGE ON SCHEMA public TO bens_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bens_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bens_app;
-- Tables the owner creates later (every migration) are granted automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bens_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO bens_app;
SQL
