import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@sahayak/shared/db'
import { eq } from 'drizzle-orm'
import { scanProject, getGraph, searchNodes } from '../knowledge'

export function knowledgeRouter() {
  const router = Router()

  // Projects
  router.get('/projects', (_req, res) => {
    const db = getDb()
    const projects = db.select().from(schema.projects).all()
    res.json(projects)
  })

  router.post('/projects', (req, res) => {
    const { path, name, language } = req.body
    if (!path || !name) return res.status(400).json({ error: 'path and name are required' })
    const db = getDb()
    const existing = db.select().from(schema.projects).where(eq(schema.projects.path, path)).get()
    if (existing) return res.status(409).json({ error: 'Project already exists', project: existing })
    const id = uuid()
    db.insert(schema.projects).values({
      id,
      path,
      name,
      language: language || 'unknown',
      lastIndexedAt: null,
    }).run()
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get()
    res.json(project)
  })

  router.delete('/projects/:id', (req, res) => {
    const db = getDb()
    // Remove all nodes/edges for this project
    const nodes = db.select().from(schema.knowledgeNodes)
      .where(eq(schema.knowledgeNodes.projectId, req.params.id)).all()
    for (const node of nodes) {
      db.delete(schema.knowledgeEdges)
        .where(eq(schema.knowledgeEdges.sourceId, node.id)).run()
      db.delete(schema.knowledgeEdges)
        .where(eq(schema.knowledgeEdges.targetId, node.id)).run()
    }
    db.delete(schema.knowledgeNodes).where(eq(schema.knowledgeNodes.projectId, req.params.id)).run()
    db.delete(schema.projects).where(eq(schema.projects.id, req.params.id)).run()
    res.json({ ok: true })
  })

  // Scan / re-scan a project
  router.post('/projects/:id/scan', (req, res) => {
    const db = getDb()
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, req.params.id)).get()
    if (!project) return res.status(404).json({ error: 'Project not found' })
    try {
      const result = scanProject(project.id, project.path)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Graph data
  router.get('/graph', (req, res) => {
    const projectId = req.query.projectId as string
    if (!projectId) return res.status(400).json({ error: 'projectId is required' })
    const graph = getGraph(projectId)
    res.json(graph)
  })

  // Search
  router.get('/search', (req, res) => {
    const projectId = req.query.projectId as string
    const query = req.query.q as string
    if (!projectId || !query) return res.status(400).json({ error: 'projectId and q are required' })
    const results = searchNodes(projectId, query)
    res.json(results)
  })

  return router
}
