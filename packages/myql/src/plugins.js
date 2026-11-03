import fs from 'node:fs/promises'
import path from 'node:path'

/** A dependency is a plugin if its name starts with `myql-` or `@myql/`. */
export const PLUGIN_RE = /^(@myql\/|myql-)/

export async function readPkg(root) {
  return JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
}

/** Direct `dependencies` only; devDependencies and transitive deps are ignored. */
export async function findPlugins(root) {
  const pkg = await readPkg(root)
  return Object.keys(pkg.dependencies ?? {}).filter((name) => PLUGIN_RE.test(name))
}
