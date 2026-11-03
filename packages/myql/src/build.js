import fs from 'node:fs/promises'
import path from 'node:path'
import { rolldown } from 'rolldown'
import { findPlugins } from './plugins.js'
import { rm } from './util.js'

/** Everything a build produces, relative to the output dir. */
export const ARTIFACTS = ['index.js', 'chunks', 'public']

const runHelper = `const run = async (name, fn) => {
  try {
    await fn?.()
  } catch (e) {
    console.error('[myql] plugin "' + name + '" failed:')
    throw e
  }
}`

function generate(plugins, side) {
  const imports = plugins.map((name, i) => `import * as p${i} from ${JSON.stringify(name)}`)
  const calls = plugins.map((name, i) => `  run(${JSON.stringify(name)}, p${i}.${side}),`)
  const tail = side === 'server' ? `\nprocess.send?.('ready')\n` : ''
  return `${imports.join('\n')}\n\n${runHelper}\n\nawait Promise.all([\n${calls.join('\n')}\n])\n${tail}`
}

/**
 * Build the project into `outDir` (the project root by default):
 *   outDir/index.js   server entry (bare imports stay external)
 *   outDir/public/    client bundle
 */
export async function build(root, outDir = root) {
  const plugins = await findPlugins(root)
  const work = path.join(root, '.myql')
  await fs.mkdir(work, { recursive: true })

  const serverEntry = path.join(work, 'entry-server.js')
  const clientEntry = path.join(work, 'entry-client.js')
  await fs.writeFile(serverEntry, generate(plugins, 'server'))
  await fs.writeFile(clientEntry, generate(plugins, 'client'))

  await fs.mkdir(outDir, { recursive: true })
  for (const a of ARTIFACTS) await rm(path.join(outDir, a))

  // server: plugins and their dependencies are loaded from node_modules at runtime
  const server = await rolldown({
    input: serverEntry,
    cwd: root,
    platform: 'node',
    external: (id) => !id.startsWith('.') && !path.isAbsolute(id),
  })
  await server.write({
    dir: outDir,
    format: 'esm',
    entryFileNames: 'index.js',
    chunkFileNames: 'chunks/[name]-[hash].js',
  })
  await server.close()

  // client: everything is bundled, unused exports (the plugins' `server`) are tree-shaken
  const client = await rolldown({
    input: clientEntry,
    cwd: root,
    platform: 'browser',
    // a plugin's leftover `node:*` imports would be unresolvable bare specifiers in the browser
    treeshake: { moduleSideEffects: [{ test: /^node:/, sideEffects: false }] },
  })
  await client.write({
    dir: path.join(outDir, 'public'),
    format: 'esm',
    entryFileNames: 'client.js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    assetFileNames: 'assets/[name]-[hash][extname]',
  })
  await client.close()

  return plugins
}
