// End-to-end check of the demo app: build, tree-shaking, install from the "UI" API,
// failed install, plugin that crashes on start (rollback), removal.
// Run after `npm install` in demo/.
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const demo = path.resolve(fileURLToPath(new URL('../demo', import.meta.url)))
const PORT = 3123
const TOKEN = 'test-token'
const base = `http://localhost:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let log = ''
const proc = spawn(process.execPath, [path.join(demo, 'node_modules/myql/bin/myql.js'), 'start'], {
  cwd: demo,
  env: { ...process.env, PORT: String(PORT), MYQL_TOKEN: TOKEN },
})
proc.stdout.on('data', (d) => (log += d))
proc.stderr.on('data', (d) => (log += d))

const results = []
function check(name, ok, extra = '') {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`)
}

async function waitUp(timeout = 90000) {
  const t = Date.now()
  while (Date.now() - t < timeout) {
    try {
      if ((await fetch(base + '/__myql/ping')).ok) return
    } catch {
      // not up yet
    }
    await sleep(300)
  }
  throw new Error('server did not come up\n' + log)
}

async function waitRestart() {
  const t = Date.now()
  while (Date.now() - t < 10000) {
    try {
      await fetch(base + '/__myql/ping')
      await sleep(100)
    } catch {
      break
    }
  }
  await waitUp()
}

async function waitLog(text, from, timeout = 90000) {
  const t = Date.now()
  while (Date.now() - t < timeout) {
    if (log.indexOf(text, from) !== -1) return true
    await sleep(300)
  }
  return false
}

const post = (p, name) =>
  fetch(base + p, {
    method: 'POST',
    headers: { 'x-myql-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
const readPkg = async () => JSON.parse(await fs.readFile(path.join(demo, 'package.json'), 'utf8'))
const text = async (p) => (await fetch(base + p)).text()

try {
  await waitUp()

  // 1. basic run + tree-shaking
  const hello = await (await fetch(base + '/hello')).json()
  check('server plugin route works', hello.hello === 'world')
  const clientJs = await text('/client.js')
  check('client bundle contains the client part', clientJs.includes('Hello from myql-hello'))
  check('client bundle has no server-only code', !clientJs.includes('SERVER_ONLY_MARKER'))
  check('client bundle has no node:fs import', !clientJs.includes('node:fs'))
  check('root page is served', (await text('/')).includes('/client.js'))

  // 2. auth and validation
  check('api rejects a missing token', (await fetch(base + '/__myql/plugins')).status === 401)
  check('install rejects non-plugin names', (await post('/__myql/plugins/install', 'express')).status === 400)

  // 3. failed build: nothing changes, server keeps running
  const pkgBefore = JSON.stringify(await readPkg())
  let r = await post('/__myql/plugins/install', 'myql-broken@file:../test-plugins/myql-broken')
  check('broken plugin: install reports an error', r.status === 500)
  check('broken plugin: package.json unchanged', JSON.stringify(await readPkg()) === pkgBefore)
  check('broken plugin: old server still works', (await fetch(base + '/hello')).ok)

  // 4. plugin that builds but crashes on start: parent rolls back
  let from = log.length
  r = await post('/__myql/plugins/install', 'myql-crash@file:../test-plugins/myql-crash')
  check('crash plugin: install accepted', r.status === 200)
  check('crash plugin: rollback happened', await waitLog('rolling back', from))
  await waitRestart()
  check('crash plugin: old version is running again', (await fetch(base + '/hello')).ok)
  check('crash plugin: package.json restored', !JSON.stringify(await readPkg()).includes('myql-crash'))

  // 5. good install
  r = await post('/__myql/plugins/install', 'myql-extra@file:../test-plugins/myql-extra')
  check('extra plugin: install accepted', r.status === 200, await r.text())
  await waitRestart()
  check('extra plugin: server route works', (await text('/extra')) === 'extra ok')
  check('extra plugin: client part is in the bundle', (await text('/client.js')).includes('EXTRA_CLIENT_MARKER'))
  check('extra plugin: listed in package.json', 'myql-extra' in (await readPkg()).dependencies)

  // 6. removal
  r = await post('/__myql/plugins/remove', 'myql-extra')
  check('remove: accepted', r.status === 200, await r.text())
  await waitRestart()
  check('remove: route is gone', (await fetch(base + '/extra')).status === 404)
  check('remove: removed from package.json', !('myql-extra' in (await readPkg()).dependencies))
  check('remove: base plugins protected', (await post('/__myql/plugins/remove', '@myql/plugins')).status === 400)
} catch (e) {
  console.error(e)
  results.push(false)
}

proc.kill('SIGTERM')
await sleep(500)
const failed = results.filter((x) => !x).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
if (failed) console.log('\n--- server log ---\n' + log)
process.exit(failed ? 1 : 0)
