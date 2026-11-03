import fs from 'node:fs/promises'
import path from 'node:path'
import { build, ARTIFACTS } from './build.js'
import { exists, rm, run } from './util.js'

const FILES = ['package.json', 'package-lock.json']

async function readIfExists(p) {
  return (await exists(p)) ? fs.readFile(p) : null
}

/**
 * Install/uninstall a plugin, build into a temp dir and swap the result in.
 * On failure the package files are restored and the running build is untouched.
 * On success the previous build and package files are kept in .myql/previous.
 */
export async function apply(root, action, spec) {
  const work = path.join(root, '.myql')
  const tmp = path.join(work, 'tmp')
  const prev = path.join(work, 'previous')

  const backups = {}
  for (const f of FILES) backups[f] = await readIfExists(path.join(root, f))

  await rm(tmp)
  try {
    console.log(`[myql] npm ${action} ${spec}`)
    await run('npm', [action, spec, '--no-audit', '--no-fund'], root)
    console.log('[myql] building')
    await build(root, tmp)
  } catch (e) {
    await restorePackageFiles(root, backups)
    await rm(tmp)
    throw e
  }

  // swap: current build -> previous, tmp -> current. No awaits on anything slow in between.
  await rm(prev)
  await fs.mkdir(prev, { recursive: true })
  for (const f of FILES) {
    if (backups[f]) await fs.writeFile(path.join(prev, f), backups[f])
  }
  for (const a of ARTIFACTS) {
    if (await exists(path.join(root, a))) await fs.rename(path.join(root, a), path.join(prev, a))
    if (await exists(path.join(tmp, a))) await fs.rename(path.join(tmp, a), path.join(root, a))
  }
  await rm(tmp)
  console.log('[myql] applied')
}

/** Put package.json / lock back and let npm prune what the failed change installed. */
export async function restorePackageFiles(root, backups) {
  for (const f of FILES) {
    const p = path.join(root, f)
    if (backups[f]) await fs.writeFile(p, backups[f])
    else await rm(p)
  }
  try {
    await run('npm', ['install', '--no-audit', '--no-fund'], root)
  } catch (e) {
    console.error(`[myql] could not resync node_modules: ${e.message}`)
  }
}

/** Roll back to the build saved by the last successful `apply`. */
export async function rollback(root) {
  const prev = path.join(root, '.myql', 'previous')
  if (!(await exists(prev))) return false
  for (const a of ARTIFACTS) {
    await rm(path.join(root, a))
    if (await exists(path.join(prev, a))) await fs.rename(path.join(prev, a), path.join(root, a))
  }
  const backups = {}
  for (const f of FILES) backups[f] = await readIfExists(path.join(prev, f))
  await restorePackageFiles(root, backups)
  await rm(prev)
  return true
}
