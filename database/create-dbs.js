const { Pool } = require("/app/node_modules/pg")

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,

  connectionTimeoutMillis: 9000,
  idleTimeoutMillis: 9000,
  max: 6,
})

createDatabases()

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function createDatabases() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await pool.query(`SELECT 1`)
      break
    } catch {
      console.log(`Waiting for database to come up…`)
      await delay(500 * attempt)
    }
  }

  console.log(`Creating databases…`)

  for (let instance = 0; instance <= 4; instance++) {
    try {
      await pool.query(`CREATE DATABASE "turing-signing-server-${instance}"`)
    } catch (error) {
      if (error.message.match(/already exists/)) {
        // ignore
      } else {
        throw error
      }
    }
  }

  console.log(`Databases created.`)
}
