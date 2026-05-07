import fs from 'fs'
import path from 'path'

const root = process.cwd()
const vendorPath = path.join(
  root,
  'unpackage',
  'dist',
  'dev',
  'mp-weixin',
  'common',
  'vendor.js'
)

if (!fs.existsSync(vendorPath)) {
  console.error(`vendor.js not found: ${vendorPath}`)
  process.exit(1)
}

const source = fs.readFileSync(vendorPath, 'utf8')
const before = `socket.close({
        code: 1006,
        reason: "connect timeout"
      });`
const after = `socket.close({
        code: 1000,
        reason: "connect timeout"
      });`

if (!source.includes(before)) {
  if (source.includes(after)) {
    console.log('mp-weixin websocket close code already patched')
    process.exit(0)
  }

  console.error('expected websocket close timeout block was not found')
  process.exit(1)
}

fs.writeFileSync(vendorPath, source.replace(before, after), 'utf8')
console.log('patched mp-weixin websocket close timeout code from 1006 to 1000')
