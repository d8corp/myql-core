import { init } from './init.js'
import { start } from './start.js'
import { apply } from './apply.js'

const [cmd, ...args] = process.argv.slice(2)
const root = process.cwd()

const usage = `myql: apps assembled from plugins

  myql init    create package.json with the base plugins
  myql start   build the project and run it
`

try {
  if (cmd === 'init') {
    await init(root)
  } else if (cmd === 'start') {
    await start(root)
  } else if (cmd === 'apply') {
    // internal: used by @myql/plugins to install/uninstall a plugin
    const [action, spec] = args
    if (!['install', 'uninstall'].includes(action) || !spec) {
      throw new Error('usage: myql apply <install|uninstall> <spec>')
    }
    await apply(root, action, spec)
  } else {
    console.log(usage)
    process.exitCode = cmd ? 1 : 0
  }
} catch (e) {
  console.error(`[myql] ${e.message}`)
  process.exit(1)
}
