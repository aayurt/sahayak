import { readdirSync, readFileSync, statSync } from 'fs'
import { join, extname, relative } from 'path'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@sahayak/shared/db'
import { eq, like, or, desc, and } from 'drizzle-orm'

interface SymbolMatch {
  name: string
  type: string
  line: number
  content: string
}

interface ImportMatch {
  source: string
  target: string
  relation: string
  line: number
}

const LANG_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.svelte-kit',
  '.cache', 'coverage', '.venv', 'venv', '__pycache__', '.vscode',
  'target', 'vendor', '.terraform', '.serverless',
])

const EXTENSIONS = new Set(Object.keys(LANG_MAP))

export function scanProject(projectId: string, projectPath: string) {
  const db = getDb()

  // Clear existing nodes/edges for this project
  const existingNodes = db.select().from(schema.knowledgeNodes)
    .where(eq(schema.knowledgeNodes.projectId, projectId)).all()
  for (const node of existingNodes) {
    db.delete(schema.knowledgeEdges)
      .where(or(eq(schema.knowledgeEdges.sourceId, node.id), eq(schema.knowledgeEdges.targetId, node.id)))
      .run()
  }
  db.delete(schema.knowledgeNodes).where(eq(schema.knowledgeNodes.projectId, projectId)).run()

  // Update last indexed time
  db.update(schema.projects).set({ lastIndexedAt: new Date() })
    .where(eq(schema.projects.id, projectId)).run()

  const files = collectFiles(projectPath)
  let totalNodes = 0
  let totalEdges = 0
  const allNodes: Array<{ id: string; label: string; type: string; file: string; line: number; content: string }> = []
  const allImports: Array<{ from: string; to: string }> = []

  for (const filePath of files) {
    const ext = extname(filePath)
    const lang = LANG_MAP[ext]
    if (!lang) continue

    const content = readFileSync(filePath, 'utf-8')
    const relPath = relative(projectPath, filePath)

    const fileNodeId = uuid()
    const now = new Date()
    db.insert(schema.knowledgeNodes).values({
      id: fileNodeId,
      projectId,
      label: relPath,
      type: 'file',
      content: content.slice(0, 500),
      metadata: { file: relPath, lines: content.split('\n').length } as any,
      createdAt: now,
    }).run()
    totalNodes++
    allNodes.push({ id: fileNodeId, label: relPath, type: 'file', file: relPath, line: 0, content: content.slice(0, 500) })

    const symbols = extractSymbols(content, lang, relPath)
    for (const sym of symbols) {
      const nodeId = uuid()
      db.insert(schema.knowledgeNodes).values({
        id: nodeId,
        projectId,
        label: sym.name,
        type: sym.type,
        content: sym.content,
        metadata: { file: relPath, line: sym.line } as any,
        createdAt: now,
      }).run()
      totalNodes++
      allNodes.push({ id: nodeId, label: sym.name, type: sym.type, file: relPath, line: sym.line, content: sym.content })

      db.insert(schema.knowledgeEdges).values({
        id: uuid(),
        sourceId: fileNodeId,
        targetId: nodeId,
        relation: 'contains',
      }).run()
      totalEdges++
    }

    const imports = extractImports(content, lang, relPath)
    for (const imp of imports) {
      allImports.push({ from: imp.source, to: imp.target })
    }
  }

  // Resolve imports to node IDs
  for (const imp of allImports) {
    const sourceNodes = allNodes.filter(n =>
      n.type !== 'file' && n.label === imp.from
    )
    const targetNodes = allNodes.filter(n =>
      n.type !== 'file' && (n.label === imp.to || n.label.endsWith('/' + imp.to))
    )
    for (const src of sourceNodes) {
      for (const tgt of targetNodes) {
        db.insert(schema.knowledgeEdges).values({
          id: uuid(),
          sourceId: src.id,
          targetId: tgt.id,
          relation: 'imports',
        }).run()
        totalEdges++
      }
    }
    // Also link file-level imports
    const sourceFiles = allNodes.filter(n => n.type === 'file' && n.label === imp.from)
    const targetFiles = allNodes.filter(n => n.type === 'file' && n.label.endsWith('/' + imp.to.replace(/\./g, '/')))
    for (const sf of sourceFiles) {
      for (const tf of targetFiles) {
        db.insert(schema.knowledgeEdges).values({
          id: uuid(),
          sourceId: sf.id,
          targetId: tf.id,
          relation: 'imports',
        }).run()
        totalEdges++
      }
    }
  }

  return { nodes: totalNodes, edges: totalEdges }
}

function collectFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (entry.startsWith('.') && entry !== '.') continue
      if (IGNORE_DIRS.has(entry)) continue
      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          results.push(...collectFiles(fullPath))
        } else if (stat.isFile() && EXTENSIONS.has(extname(entry))) {
          results.push(fullPath)
        }
      } catch { /* skip unreadable */ }
    }
  } catch { /* skip unreadable */ }
  return results
}

export function extractSymbols(content: string, lang: string, filePath: string): SymbolMatch[] {
  const symbols: SymbolMatch[] = []

  switch (lang) {
    case 'javascript':
    case 'typescript': {
      // Functions
      const funcRe = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g
      let m: RegExpExecArray | null
      while ((m = funcRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'function', line, content: extractLine(content, m.index) })
      }
      // Arrow functions assigned to const/let
      const arrowRe = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g
      while ((m = arrowRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'function', line, content: extractLine(content, m.index) })
      }
      // Classes
      const classRe = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g
      while ((m = classRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'class', line, content: extractLine(content, m.index) })
      }
      // Interfaces
      const ifaceRe = /(?:export\s+)?interface\s+(\w+)/g
      while ((m = ifaceRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'interface', line, content: extractLine(content, m.index) })
      }
      // Types
      const typeRe = /(?:export\s+)?type\s+(\w+)\s*=/g
      while ((m = typeRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'type', line, content: extractLine(content, m.index) })
      }
      break
    }
    case 'python': {
      const funcRe = /(?:async\s+)?def\s+(\w+)/g
      let m: RegExpExecArray | null
      while ((m = funcRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'function', line, content: extractLine(content, m.index) })
      }
      const classRe = /class\s+(\w+)/g
      while ((m = classRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'class', line, content: extractLine(content, m.index) })
      }
      break
    }
    case 'go': {
      const funcRe = /func\s+(?:\([^)]*\)\s*)?(\w+)/g
      while ((m = funcRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'function', line, content: extractLine(content, m.index) })
      }
      const typeRe = /type\s+(\w+)\s+(?:struct|interface)/g
      while ((m = typeRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'type', line, content: extractLine(content, m.index) })
      }
      break
    }
    case 'rust': {
      const fnRe = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g
      while ((m = fnRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'function', line, content: extractLine(content, m.index) })
      }
      const structRe = /(?:pub\s+)?struct\s+(\w+)/g
      while ((m = structRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'struct', line, content: extractLine(content, m.index) })
      }
      const enumRe = /(?:pub\s+)?enum\s+(\w+)/g
      while ((m = enumRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'enum', line, content: extractLine(content, m.index) })
      }
      const traitRe = /(?:pub\s+)?trait\s+(\w+)/g
      while ((m = traitRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        symbols.push({ name: m[1], type: 'trait', line, content: extractLine(content, m.index) })
      }
      break
    }
  }

  return symbols
}

export function extractImports(content: string, lang: string, _filePath: string): ImportMatch[] {
  const imports: ImportMatch[] = []

  switch (lang) {
    case 'javascript':
    case 'typescript': {
      // import ... from '...'
      const importRe = /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g
      let m: RegExpExecArray | null
      while ((m = importRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        imports.push({ source: _filePath, target: m[1], relation: 'imports', line })
      }
      // require
      const requireRe = /(?:const|let|var)\s+\w+\s*=\s*require\(['"]([^'"]+)['"]\)/g
      while ((m = requireRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        imports.push({ source: _filePath, target: m[1], relation: 'imports', line })
      }
      break
    }
    case 'python': {
      const importRe = /(?:from\s+(\S+)\s+)?import\s+(\S+)/g
      while ((m = importRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        const target = m[1] || m[2]
        imports.push({ source: _filePath, target, relation: 'imports', line })
      }
      break
    }
    case 'go': {
      const importRe = /"([^"]+)"/g
      const inImportBlock = content.includes('import (')
      if (inImportBlock) {
        while ((m = importRe.exec(content)) !== null) {
          const line = content.slice(0, m.index).split('\n').length
          imports.push({ source: _filePath, target: m[1], relation: 'imports', line })
        }
      }
      break
    }
    case 'rust': {
      const useRe = /use\s+([^;]+)/g
      while ((m = useRe.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length
        imports.push({ source: _filePath, target: m[1], relation: 'imports', line })
      }
      break
    }
  }

  return imports
}

function extractLine(content: string, index: number): string {
  const start = content.lastIndexOf('\n', index) + 1
  const end = content.indexOf('\n', index)
  return content.slice(start, end > 0 ? end : undefined).trim().slice(0, 200)
}

export function getGraph(projectId: string) {
  const db = getDb()
  const nodes = db.select().from(schema.knowledgeNodes)
    .where(eq(schema.knowledgeNodes.projectId, projectId))
    .all()
  const edges = db.select().from(schema.knowledgeEdges)
    .all()
  // Filter edges to only those connecting nodes in this project
  const nodeIds = new Set(nodes.map(n => n.id))
  const filteredEdges = edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
  return { nodes, edges: filteredEdges }
}

export function searchNodes(projectId: string, query: string) {
  const db = getDb()
  const pattern = `%${query}%`
  return db.select().from(schema.knowledgeNodes)
    .where(and(
      eq(schema.knowledgeNodes.projectId, projectId),
      or(
        like(schema.knowledgeNodes.label, pattern),
        like(schema.knowledgeNodes.content, pattern),
      ),
    ))
    .orderBy(schema.knowledgeNodes.label)
    .limit(50)
    .all()
}
