import { api } from '@myql/server'

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>myql</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/client.js"></script>
  </body>
</html>
`

// server part: the root page and the two endpoints the reload logic uses
export function server() {
  api.add('/', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
  })

  api.add('/__myql/ping', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' })
    res.end('ok')
  })

  api.add('/__myql/events', (req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    res.write(': connected\n\n')
    const timer = setInterval(() => res.write(': ping\n\n'), 15000)
    req.on('close', () => clearInterval(timer))
  })
}

// client part: when the connection to the server drops, wait until it is back and reload
export function client() {
  const source = new EventSource('/__myql/events')
  source.onerror = () => {
    source.close()
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/__myql/ping', { cache: 'no-store' })
        if (res.ok) {
          clearInterval(timer)
          location.reload()
        }
      } catch {
        // server is still down
      }
    }, 1000)
  }
}
