import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const routes = new Map()

/**
 * Registry other plugins add themselves to:
 *   import { api } from '@myql/server'
 *   api.add('/hello', (req, res) => res.end('hi'))
 * Routes are looked up per request, so the order plugins start in does not matter.
 */
export const api = {
  routes,
  add(pathname, handler) {
    routes.set(pathname, handler)
    return () => routes.delete(pathname)
  },
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function serveStatic(root, pathname, res) {
  let file
  try {
    file = path.join(root, decodeURIComponent(pathname))
  } catch {
    res.writeHead(400).end('bad request')
    return
  }
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end('forbidden')
    return
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'content-length': stat.size,
    })
    fs.createReadStream(file).pipe(res)
  })
}

export function server() {
  const port = Number(process.env.PORT) || 3000
  const root = path.resolve('public')

  return new Promise((resolve, reject) => {
    const srv = http.createServer(async (req, res) => {
      const { pathname } = new URL(req.url, 'http://localhost')
      const handler = routes.get(pathname)
      if (handler) {
        try {
          await handler(req, res)
        } catch (e) {
          console.error(`[myql] ${pathname}:`, e)
          if (!res.headersSent) res.writeHead(500)
          res.end('internal error')
        }
        return
      }
      serveStatic(root, pathname, res)
    })
    srv.once('error', reject)
    srv.listen(port, () => {
      console.log(`[myql] listening on http://localhost:${port}`)
      resolve(srv)
    })
  })
}
