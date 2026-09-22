"""C24 proof: the CI workflow runs the e2e suite on pushes to main against built apps."""
import sys
from pathlib import Path

import yaml

workflow = yaml.safe_load(Path(".github/workflows/ci.yml").read_text())
job = workflow["jobs"].get("e2e")
problems = []
if job is None:
    sys.exit("no e2e job")
if job.get("if") != "github.event_name == 'push' && github.ref == 'refs/heads/main'":
    problems.append(f"e2e must run only on push to main, got: {job.get('if')!r}")
runs = [step.get("run", "") for step in job["steps"]]
for needle in ["prisma migrate deploy", "pnpm build", "node dist/server.js", "preview", "pnpm e2e"]:
    if not any(needle in run for run in runs):
        problems.append(f"no step runs {needle!r}")
if set(job.get("services", {})) != {"postgres", "mailpit"}:
    problems.append(f"services: {sorted(job.get('services', {}))}")
if problems:
    sys.exit("\n".join(problems))
print("e2e job: ok")
