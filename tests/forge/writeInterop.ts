import fs from 'fs'

const INTEROP_FILE = './tests/forge/interop.json'

// updates the interop file with a new fixture
export function registerFixture(key: string, data: any) {
  let interop: { [key: string]: any } = fs.existsSync(INTEROP_FILE)
    ? JSON.parse(fs.readFileSync(INTEROP_FILE).toString())
    : {}

  interop[key] = data
  fs.writeFileSync(INTEROP_FILE, JSON.stringify(interop, null, 2))
}
