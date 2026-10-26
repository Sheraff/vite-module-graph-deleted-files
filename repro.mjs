// node [--expose-gc] repro.mjs [--cycles=200] [--direct]
// Creates src/gen/mod-<i>.js, imports it from src/entry.js, transforms both
// modules through the dev server, deletes the generated file, then prints the
// size of the client module graph maps against the number of existing files.
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { createServer } from 'vite'

const root = new URL('.', import.meta.url).pathname
const cycles = Number(process.argv.find((a) => a.startsWith('--cycles='))?.slice(9) ?? 200)
const direct = process.argv.includes('--direct')
const genDir = root + 'src/gen/'
const entry = root + 'src/entry.js'

for (const f of readdirSync(genDir)) {
  if (f !== '.gitkeep') rmSync(genDir + f)
}
writeFileSync(entry, 'export default 0\n')

const server = await createServer({ root, logLevel: 'warn', server: { port: 5198, strictPort: true, watch: {} } })
await server.listen()
const env = server.environments.client
const graph = env.moduleGraph

const unlinked = new Set()
server.watcher.on('unlink', (f) => unlinked.add(f))
const waitUnlink = async (file) => {
  const until = Date.now() + 5000
  while (!unlinked.has(file)) {
    if (Date.now() > until) throw new Error('watcher did not report the unlink of ' + file)
    await sleep(20)
  }
  await sleep(150) // let Vite's own unlink handler finish
}

const liveFiles = () => readdirSync(genDir).filter((f) => f !== '.gitkeep').length + 1
const row = (i) => {
  global.gc?.()
  const heap = global.gc ? ` heapUsed=${(process.memoryUsage().heapUsed / 1048576).toFixed(1)}MB` : ''
  console.log(
    `cycle=${String(i).padStart(4)} liveFiles=${liveFiles()} idToModuleMap=${graph.idToModuleMap.size} urlToModuleMap=${graph.urlToModuleMap.size} fileToModulesMap=${graph.fileToModulesMap.size}${heap}`,
  )
}

try {
  await env.transformRequest('/src/entry.js')
  row(0)
  let lastFile
  for (let i = 1; i <= cycles; i++) {
    const file = `${genDir}mod-${i}.js`
    writeFileSync(file, `export const v = ${i}\n`)
    writeFileSync(entry, `import { v } from './gen/mod-${i}.js'\nexport default v\n`)
    graph.onFileChange(entry) // what the watcher's change event does; keeps the loop deterministic
    await env.transformRequest('/src/entry.js')
    await env.transformRequest(`/src/gen/mod-${i}.js`)
    rmSync(file)
    if (direct) {
      graph.onFileDelete(file)
    } else {
      await waitUnlink(file)
    }
    lastFile = file
    if (i % 25 === 0) row(i)
  }
  const mods = graph.getModulesByFile(lastFile)
  console.log(
    `\nlast deleted file exists on disk: ${existsSync(lastFile)}; still in fileToModulesMap: ${!!mods}; in idToModuleMap: ${graph.idToModuleMap.has(lastFile)}; in urlToModuleMap: ${graph.urlToModuleMap.has('/src/gen/mod-' + cycles + '.js')}`,
  )
} finally {
  writeFileSync(entry, 'export default 0\n')
  for (const f of readdirSync(genDir)) {
    if (f !== '.gitkeep') rmSync(genDir + f)
  }
  await server.close()
}
