import { api } from '@myql/server'

export function server() {
  api.add('/extra', (req, res) => res.end('extra ok'))
}

export function client() {
  document.body.append('EXTRA_CLIENT_MARKER')
}
