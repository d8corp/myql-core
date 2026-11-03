import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'

export async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export const rm = (p) => fs.rm(p, { recursive: true, force: true })

/** Run a command, resolve with its output, reject with the output tail on failure. */
export function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`${cmd} ${args.join(' ')} failed (${code})\n${out.slice(-2000)}`))
    })
  })
}
