# Vite dev server keeps module graph nodes of deleted files

`repro.mjs` starts a dev server (no browser) and runs N cycles: create `src/gen/mod-<i>.js`, import it from
`src/entry.js`, transform both, delete the generated file, wait for the watcher's `unlink`. It prints the client
module graph map sizes next to the number of files that exist.

```sh
npm install
node --expose-gc repro.mjs    # or: npm run repro (no heap column)
node repro.mjs --direct       # call moduleGraph.onFileDelete(file) instead of waiting for the watcher
node repro.mjs --cycles=50
```

Output with vite 8.3.5:

```
cycle=   0 liveFiles=1 idToModuleMap=1 urlToModuleMap=1 fileToModulesMap=1 heapUsed=13.4MB
cycle= 100 liveFiles=1 idToModuleMap=101 urlToModuleMap=101 fileToModulesMap=101 heapUsed=14.7MB
cycle= 200 liveFiles=1 idToModuleMap=201 urlToModuleMap=201 fileToModulesMap=201 heapUsed=15.1MB

last deleted file exists on disk: false; still in fileToModulesMap: true; in idToModuleMap: true; in urlToModuleMap: true
```

Expected: the map sizes stay constant (one live file).
