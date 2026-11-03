import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { api } from '@myql/server'

const RESTART_CODE = 75
const PLUGIN_RE = /^(@myql\/|myql-)/
// plugin name with an optional version/spec after the last "@": myql-foo, @myql/foo@1.2.3, myql-foo@file:../foo
const SPEC_RE = /^(@myql\/[a-z0-9][\w.-]*|myql-[a-z0-9][\w.-]*)(@\S+)?$/i
// never removable from the UI: removing them would lock you out
const PROTECTED = new Set(['@myql/server', '@myql/plugins'])

let busy = false

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 10_000) throw new Error('body too large')
  }
  return raw ? JSON.parse(raw) : {}
}

async function listPlugins() {
  const pkg = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'))
  return Object.entries(pkg.dependencies ?? {})
    .filter(([name]) => PLUGIN_RE.test(name))
    .map(([name, version]) => ({ name, version, removable: !PROTECTED.has(name) }))
}

/** Runs `myql apply` in a child process. Resolves when the new build is in place. */
function applyChange(action, spec) {
  const bin = process.env.MYQL_BIN
  if (!bin) throw new Error('not running under `myql start`: cannot apply changes')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, 'apply', action, spec], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(out.slice(-1500) || `apply failed (${code})`))
    })
  })
}

export function server() {
  const token = process.env.MYQL_TOKEN || randomBytes(12).toString('hex')
  if (!process.env.MYQL_TOKEN) console.log(`[myql] plugin manager token: ${token}`)

  const guard = (handler) => async (req, res) => {
    if (req.headers['x-myql-token'] !== token) return json(res, 401, { error: 'invalid token' })
    try {
      await handler(req, res)
    } catch (e) {
      json(res, e.status ?? 500, { error: e.message })
    }
  }

  const change = (action) =>
    guard(async (req, res) => {
      if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
      const { name } = await readBody(req)
      if (typeof name !== 'string' || !SPEC_RE.test(name)) {
        return json(res, 400, { error: 'expected a plugin name starting with myql- or @myql/' })
      }
      const bare = name.replace(/^(@?[^@]+)@.*$/, '$1')
      if (action === 'uninstall' && PROTECTED.has(bare)) {
        return json(res, 400, { error: `${bare} cannot be removed from the UI` })
      }
      if (busy) return json(res, 409, { error: 'another change is in progress' })

      busy = true
      try {
        await applyChange(action, action === 'uninstall' ? bare : name)
      } catch (e) {
        busy = false
        return json(res, 500, { error: e.message })
      }
      // `busy` stays set: the process is about to restart with the new build
      json(res, 200, { ok: true })
      setTimeout(() => process.exit(RESTART_CODE), 200)
    })

  api.add('/__myql/plugins', guard(async (req, res) => json(res, 200, await listPlugins())))
  api.add('/__myql/plugins/install', change('install'))
  api.add('/__myql/plugins/remove', change('uninstall'))
}

const css = `
#myql-plugins{position:fixed;right:12px;bottom:12px;width:300px;font:13px/1.4 system-ui,sans-serif;
background:#fff;color:#111;border:1px solid #ccc;border-radius:8px;padding:10px;box-shadow:0 2px 12px #0002}
#myql-plugins input{width:100%;box-sizing:border-box;margin:2px 0 6px;padding:4px}
#myql-plugins li{display:flex;justify-content:space-between;gap:6px;margin:2px 0}
#myql-plugins ul{margin:6px 0;padding:0;list-style:none}
#myql-plugins .err{color:#b00020;white-space:pre-wrap}
`

export function client() {
  const box = document.createElement('div')
  box.id = 'myql-plugins'
  box.innerHTML = `<style>${css}</style><b>Plugins</b>
    <input class="token" placeholder="token (see server log)" type="password">
    <ul></ul>
    <input class="name" placeholder="myql-something or @myql/something">
    <button class="add">Install</button>
    <div class="err"></div>`
  document.body.append(box)

  const $ = (sel) => box.querySelector(sel)
  const token = $('.token')
  const err = $('.err')
  try {
    token.value = sessionStorage.getItem('myql-token') ?? ''
  } catch {
    // storage unavailable
  }

  async function call(url, body) {
    err.textContent = ''
    try {
      sessionStorage.setItem('myql-token', token.value)
    } catch {
      // storage unavailable
    }
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-myql-token': token.value, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    return data
  }

  async function refresh() {
    try {
      const list = await call('/__myql/plugins')
      const ul = $('ul')
      ul.innerHTML = ''
      for (const p of list) {
        const li = document.createElement('li')
        li.textContent = `${p.name} ${p.version}`
        if (p.removable) {
          const b = document.createElement('button')
          b.textContent = 'remove'
          b.onclick = () => change('/__myql/plugins/remove', p.name)
          li.append(b)
        }
        ul.append(li)
      }
    } catch (e) {
      err.textContent = e.message
    }
  }

  async function change(url, name) {
    err.textContent = 'working... the page reloads when the server is back'
    try {
      await call(url, { name })
    } catch (e) {
      err.textContent = e.message
    }
  }

  $('.add').onclick = () => change('/__myql/plugins/install', $('.name').value.trim())
  token.onchange = refresh
  refresh()
}
