import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

if (process.platform !== 'darwin') {
  console.error('macOS 安装包需要在 Mac 上构建。请在 Mac 运行 npm run desktop:mac，或使用仓库的 macOS GitHub Actions。')
  process.exit(1)
}

const root = fileURLToPath(new URL('../', import.meta.url))
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('xcrun', ['--find', 'clang'])
run('rustup', ['target', 'add', 'aarch64-apple-darwin', 'x86_64-apple-darwin'])
run('npm', ['run', 'desktop:build', '--prefix', 'web', '--', '--target', 'universal-apple-darwin', '--bundles', 'app,dmg', '--', '--locked'])

const bundle = join(root, 'web/src-tauri/target/universal-apple-darwin/release/bundle')
const files = readdirSync(join(bundle, 'dmg')).filter(name => name.endsWith('.dmg')).sort()
if (!files.length) throw new Error('构建结束但未找到 DMG 安装包')
writeFileSync(join(bundle, 'SHA256SUMS.txt'), files.map(name => {
  const hash = createHash('sha256').update(readFileSync(join(bundle, 'dmg', name))).digest('hex')
  return `${hash}  dmg/${name}\n`
}).join(''))
console.log(`macOS 通用安装包与校验值：${bundle}`)
