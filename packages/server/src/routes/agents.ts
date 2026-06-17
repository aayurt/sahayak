import { Router } from 'express'
import { executeSkill, listAgentRuns, getAgentRun, listAgentMemory } from '../agent'

export function agentsRouter() {
  const router = Router()

  // Run a skill
  router.post('/run/:skillId', async (req, res) => {
    try {
      const { skillId } = req.params
      const input = req.body.input || {}
      const { runId, stream } = executeSkill(skillId, input)

      const sseRes = res as any
      sseRes.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      sseRes.write(`data: ${JSON.stringify({ type: 'start', runId })}\n\n`)

      try {
        for await (const chunk of stream()) {
          sseRes.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
        }
        sseRes.write(`data: ${JSON.stringify({ type: 'done', runId })}\n\n`)
      } catch (err) {
        sseRes.write(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`)
      }
      sseRes.end()
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Run a skill (non-streaming)
  router.post('/run/:skillId/sync', async (req, res) => {
    try {
      const { skillId } = req.params
      const input = req.body.input || {}
      const { runId, stream } = executeSkill(skillId, input)

      let fullContent = ''
      for await (const chunk of stream()) {
        fullContent += chunk
      }
      res.json({ runId, output: fullContent })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // List agent runs
  router.get('/runs', (_req, res) => {
    const limit = Number(_req.query.limit) || 20
    res.json(listAgentRuns(limit))
  })

  // Get specific run
  router.get('/runs/:id', (req, res) => {
    const run = getAgentRun(req.params.id)
    if (!run) return res.status(404).json({ error: 'Run not found' })
    res.json(run)
  })

  // Agent memory
  router.get('/memory', (_req, res) => {
    const limit = Number(_req.query.limit) || 50
    res.json(listAgentMemory(limit))
  })

  return router
}
