import fs from 'node:fs/promises'
import path from 'node:path'
import { exists } from './util.js'

export async function init(root) {
  const pkgPath = path.join(root, 'package.json')
  if (await exists(pkgPath)) throw new Error('package.json already exists here')

  const pkg = {
    name: path.basename(root).toLowerCase().replace(/[^a-z0-9-_.]+/g, '-') || 'my-app',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: { start: 'myql start' },
    dependencies: {
      '@myql/server': 'latest',
      '@myql/client': 'latest',
      '@myql/plugins': 'latest',
    },
    devDependencies: { myql: 'latest' },
  }
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  const ignorePath = path.join(root, '.gitignore')
  if (!(await exists(ignorePath))) {
    await fs.writeFile(ignorePath, 'node_modules\n.myql\nindex.js\npublic\n')
  }

  console.log('[myql] created package.json. Next: npm install && npm start')
}
