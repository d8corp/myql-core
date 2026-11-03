import fs from 'node:fs'
import { api } from '@myql/server'

export function server() {
  api.add('/hello', (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ hello: 'world', SERVER_ONLY_MARKER: fs.existsSync('.') }))
  })
}

export function client() {
  const h = document.createElement('h1')
  h.textContent = 'Hello from myql-hello'
  document.body.prepend(h)
}
