import { createSahayakServer } from '@sahayak/server'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function startEmbeddedServer() {
  const staticDir = path.resolve(__dirname, '../../ui/dist')

  const server = await createSahayakServer({
    port: 9090,
    staticDir,
  })

  await server.start()
  return server
}
