import { Router } from 'express'
import { listSidecars, startSidecar, stopSidecar, getSidecar } from '../sidecar'

export function sidecarsRouter() {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(listSidecars())
  })

  router.post('/:id/start', async (req, res) => {
    const { command, args, env } = req.body
    try {
      await startSidecar(req.params.id, req.params.id, command, args, env)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  router.post('/:id/stop', (req, res) => {
    stopSidecar(req.params.id)
    res.json({ ok: true })
  })

  router.get('/:id', (req, res) => {
    const sc = getSidecar(req.params.id)
    if (!sc) return res.status(404).json({ error: 'Not found' })
    const proxyUrl = `/sidecar/${sc.id}`
    res.json({ id: sc.id, name: sc.name, port: sc.port, proxyUrl })
  })

  return router
}
