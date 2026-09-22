import type { Deps } from './dependencies.ts'
import { registerEmailWorker } from './emails/send-email.tsx'

// Every queue worker and cron, registered after `queue.start()` (a queue must have a worker before
// anything is enqueued on it). Shared by the server and the tests.
export async function registerWorkers(deps: Deps) {
  await registerEmailWorker(deps)
}
