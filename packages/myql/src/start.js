import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from './build.js'
import { rollback } from './apply.js'

/** Exit code a plugin uses to ask for a restart after a successful apply. */
export const RESTART_CODE = 75

export async function start(root) {
  const bin = fileURLToPath(new URL('../bin/myql.js', import.meta.url))

  console.log('[myql] building')
  await build(root)

  let current = null
  let stopping = false
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      stopping = true
      if (current) current.kill(sig)
      else process.exit(0)
    })
  }

  // true after a restart requested by apply, until the new build reports "ready"
  let updating = false

  while (true) {
    let ready = false
    const child = spawn(process.execPath, ['index.js'], {
      cwd: root,
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, MYQL_BIN: bin },
    })
    current = child
    child.on('message', (m) => {
      if (m === 'ready') {
        ready = true
        updating = false
      }
    })

    const code = await new Promise((resolve) => {
      child.on('exit', (c, signal) => resolve(signal ? 0 : (c ?? 0)))
    })
    current = null

    if (stopping) process.exit(code)

    if (code === RESTART_CODE) {
      console.log('[myql] restarting with the new build')
      updating = true
      continue
    }

    if (updating && !ready) {
      console.error('[myql] the new build did not start, rolling back')
      if (await rollback(root)) {
        updating = false
        continue
      }
    }

    process.exit(code)
  }
}
