import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, getDb, schema } from '@sahayak/shared/db'
import { v4 as uuid } from 'uuid'
import { extractSymbols, extractImports, searchNodes, getGraph } from './knowledge'

describe('knowledge helpers', () => {
  beforeAll(() => {
    process.env.SAHAYAK_DB_PATH = ':memory:'
    initDb()
  })

  describe('extractSymbols', () => {
    it('extracts functions from TypeScript', () => {
      const code = `
function hello() {}
export function world() {}
const arrow = () => {}
export const add = (a: number, b: number) => a + b
      `
      const symbols = extractSymbols(code, 'typescript', 'test.ts')
      expect(symbols.filter(s => s.type === 'function').length).toBe(4)
      expect(symbols.find(s => s.name === 'hello')).toBeDefined()
      expect(symbols.find(s => s.name === 'world')).toBeDefined()
      expect(symbols.find(s => s.name === 'arrow')).toBeDefined()
      expect(symbols.find(s => s.name === 'add')).toBeDefined()
    })

    it('extracts classes from TypeScript', () => {
      const code = `
class MyClass {}
export class ExportedClass {}
abstract class AbstractClass {}
      `
      const symbols = extractSymbols(code, 'typescript', 'test.ts')
      const classes = symbols.filter(s => s.type === 'class')
      expect(classes.length).toBe(3)
    })

    it('extracts interfaces and types from TypeScript', () => {
      const code = `
interface User {}
export interface Config {}
type Options = {}
export type Result = {}
      `
      const symbols = extractSymbols(code, 'typescript', 'test.ts')
      expect(symbols.filter(s => s.type === 'interface').length).toBe(2)
      expect(symbols.filter(s => s.type === 'type').length).toBe(2)
    })

    it('extracts functions from Python', () => {
      const code = `
def hello():
    pass
async def world():
    pass
      `
      const symbols = extractSymbols(code, 'python', 'test.py')
      expect(symbols.filter(s => s.type === 'function').length).toBe(2)
    })

    it('extracts classes from Python', () => {
      const code = `
class MyClass:
    pass
      `
      const symbols = extractSymbols(code, 'python', 'test.py')
      expect(symbols.filter(s => s.type === 'class').length).toBe(1)
    })
  })

  describe('extractImports', () => {
    it('extracts ES imports from TypeScript', () => {
      const code = `
import { foo } from './foo'
import bar from 'bar'
import * as everything from 'lib'
import('./dynamic').then(m => m.default)
      `
      const imports = extractImports(code, 'typescript', 'test.ts')
      expect(imports.length).toBe(3)
      expect(imports[0].target).toBe('./foo')
    })

    it('extracts require calls', () => {
      const code = `
const fs = require('fs')
const path = require('path')
      `
      const imports = extractImports(code, 'javascript', 'test.js')
      expect(imports.length).toBe(2)
    })
  })

  describe('searchNodes', () => {
    it('search returns matching nodes', () => {
      const db = getDb()
      const projectId = uuid()
      const now = new Date()

      db.insert(schema.projects).values({
        id: projectId, path: '/test/proj', name: 'test', language: 'typescript',
      }).run()

      db.insert(schema.knowledgeNodes).values({
        id: uuid(),
        projectId,
        label: 'myFunction',
        type: 'function',
        content: 'function myFunction() {}',
        metadata: {},
        createdAt: now,
      }).run()
      db.insert(schema.knowledgeNodes).values({
        id: uuid(),
        projectId,
        label: 'otherThing',
        type: 'class',
        content: 'class Other {}',
        metadata: {},
        createdAt: now,
      }).run()

      const results = searchNodes(projectId, 'myFunction')
      expect(results.length).toBe(1)
      expect(results[0].label).toBe('myFunction')

      const all = searchNodes(projectId, '')
      expect(all.length).toBe(2)
    })
  })

  describe('getGraph', () => {
    it('returns nodes and filtered edges', () => {
      const db = getDb()
      const projectId = uuid()
      const otherId = uuid()
      const now = new Date()

      db.insert(schema.projects).values({
        id: projectId, path: '/test/graph', name: 'graph-test', language: 'typescript',
      }).run()

      const nodeId = uuid()
      db.insert(schema.knowledgeNodes).values({
        id: nodeId, projectId, label: 'A', type: 'function',
        content: '', metadata: {}, createdAt: now,
      }).run()
      const nodeId2 = uuid()
      db.insert(schema.knowledgeNodes).values({
        id: nodeId2, projectId, label: 'B', type: 'function',
        content: '', metadata: {}, createdAt: now,
      }).run()
      // Edge between project nodes
      db.insert(schema.knowledgeEdges).values({
        id: uuid(), sourceId: nodeId, targetId: nodeId2, relation: 'imports',
      }).run()
      // Edge to node in other project (should be excluded from graph query)
      db.insert(schema.projects).values({
        id: otherId, path: '/other/proj', name: 'other', language: 'go',
      }).run()
      db.insert(schema.knowledgeNodes).values({
        id: otherId, projectId: otherId, label: 'C', type: 'function',
        content: '', metadata: {}, createdAt: now,
      }).run()
      db.insert(schema.knowledgeEdges).values({
        id: uuid(), sourceId: nodeId, targetId: otherId, relation: 'imports',
      }).run()

      const graph = getGraph(projectId)
      expect(graph.nodes.length).toBe(2)
      expect(graph.edges.length).toBe(1)
    })
  })
})
