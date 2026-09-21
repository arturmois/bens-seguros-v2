-- Application role for the server, the tests and pg-boss (ADR-004). It is neither superuser nor
-- BYPASSRLS and owns no application table, so row level security always applies to it. The owner
-- (POSTGRES_USER) runs only the Prisma migrations.
-- Runs on a fresh docker volume (docker-entrypoint-initdb.d) and in CI; idempotent, so it can also
-- be applied to an existing database by hand.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bens_app') THEN
    CREATE ROLE bens_app LOGIN PASSWORD 'bens_app' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
  END IF;
  -- CREATE: pg-boss creates and owns its own schema.
  EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO bens_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO bens_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bens_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bens_app;
-- Tables the owner creates later (every migration) are granted automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bens_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO bens_app;
