#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'
import { fileURLToPath } from 'url'
import { createSahayakServer } from './index.js'
import open from 'open'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultStaticDir = path.resolve(__dirname, '../../ui/dist')

yargs(hideBin(process.argv))
  .command(
    '$0',
    'Start Sahayak in desktop mode (opens browser)',
    (y) =>
      y
        .option('port', { alias: 'p', type: 'number', default: 9090 })
        .option('vault-path', { alias: 'v', type: 'string', desc: 'Obsidian vault path' })
        .option('skills-dir', { alias: 's', type: 'string', desc: 'Skills directory' })
        .option('no-voice', { type: 'boolean', desc: 'Disable voice sidecar' }),
    async (argv) => {
      const server = await createSahayakServer({
        port: argv.port,
        staticDir: defaultStaticDir,
        vaultPath: argv['vault-path'],
        skillsDir: argv['skills-dir'],
        voiceEnabled: !argv['no-voice'],
      })
      await server.start()
      if (argv.port === 9090 || argv.port) {
        open(`http://localhost:${argv.port}`)
      }
    },
  )
  .command(
    'server',
    'Start Sahayak in server mode (no browser open)',
    (y) =>
      y
        .option('port', { alias: 'p', type: 'number', default: 9090 })
        .option('password', { alias: 'pw', type: 'string', desc: 'Password for browser access' })
        .option('vault-path', { alias: 'v', type: 'string', desc: 'Obsidian vault path' })
        .option('skills-dir', { alias: 's', type: 'string', desc: 'Skills directory' })
        .option('no-voice', { type: 'boolean', desc: 'Disable voice sidecar' }),
    async (argv) => {
      const server = await createSahayakServer({
        port: argv.port,
        password: argv.password,
        staticDir: defaultStaticDir,
        vaultPath: argv['vault-path'],
        skillsDir: argv['skills-dir'],
        voiceEnabled: !argv['no-voice'],
      })
      await server.start()
    },
  )
  .parse()
