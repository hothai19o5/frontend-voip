// Portable fallback for Windows Postman's dataset-daemon failure. Runs exactly
// the same mock handler with an in-memory pm.state, without claiming CLI evidence.
const records = new Map()
global.pm = {
  state: {
    get: async (key) => structuredClone(records.get(key)),
    set: async (key, value) => records.set(key, structuredClone(value)),
  },
}
process.env.PORT ||= '14020'
require('../postman/mocks/voip/default.cjs')
console.log(`VoIP API mock: http://127.0.0.1:${process.env.PORT}`)
