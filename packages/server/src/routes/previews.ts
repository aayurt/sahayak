import { Request, Response, Router } from 'express'
import { z } from 'zod'
import { validate } from '../validation'
import { PreviewManager } from '../previews/manager'

const PreviewCreateSchema = z.object({
  sessionId: z.string().trim().min(1),
  url: z.string().trim().min(1),
})

export function previewRouter(previewManager: PreviewManager): Router {
  const router = Router()

  router.post('/api/previews', validate(PreviewCreateSchema), (req: Request, res: Response) => {
    try {
      const preview = previewManager.create(req.body.sessionId, req.body.url)
      res.status(201).json(preview)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create preview' })
    }
  })

  router.delete('/api/previews/:token', (req: Request, res: Response) => {
    const removed = previewManager.delete(req.params.token)
    if (!removed) {
      res.status(404).json({ error: 'Preview not found' })
      return
    }
    res.status(204).end()
  })

  return router
}

// Preview proxy — rewrites HTML/CSS URLs and strips sandbox-blocking headers
export function createPreviewProxy(previewManager: PreviewManager) {
  return async (req: Request, res: Response) => {
    const match = req.originalUrl.match(/^\/previews\/([^/]+)(?:\/(.*))?$/)
    if (!match) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const token = decodeURIComponent(match[1])
    const pathSuffix = match[2] ?? ''
    const preview = previewManager.get(token)
    if (!preview) {
      res.status(404).json({ error: 'Preview not found' })
      return
    }

    const queryIndex = req.originalUrl.indexOf('?')
    const search = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : ''
    const requestPath = pathSuffix
      ? `${previewManager.buildProxyBasePath(token)}/${pathSuffix.replace(/^\/+/, '')}`
      : previewManager.buildProxyBasePath(token)
    const targetUrl = previewManager.buildTargetUrl(token, requestPath, search)
    if (!targetUrl) {
      res.status(404).json({ error: 'Preview target not resolved' })
      return
    }

    try {
      const response = await fetch(targetUrl.toString(), {
        method: req.method,
        headers: buildProxyHeaders(req.headers, targetUrl.origin),
        redirect: 'manual',
      })

      const headers = rewritePreviewResponseHeaders(response.headers, token, targetUrl.origin)
      const contentType = response.headers.get('content-type') ?? ''

      for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) res.setHeader(key, value)
      }
      res.status(response.status)

      if (req.method === 'HEAD') {
        res.end()
        return
      }

      const text = await response.text()
      if (isHtmlContentType(contentType) || isCssContentType(contentType)) {
        res.send(rewritePreviewBodyUrls(text, previewManager.buildProxyBasePath(token), isCssContentType(contentType) ? 'css' : 'html'))
      } else {
        res.send(text)
      }
    } catch (error) {
      console.error('[preview] proxy error:', (error as Error).message)
      res.status(502).json({ error: 'Preview proxy failed' })
    }
  }
}

function buildProxyHeaders(headers: Record<string, unknown>, targetOrigin: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue
    const lower = key.toLowerCase()
    if (lower === 'cookie' || lower === 'host' || lower === 'connection' || lower === 'upgrade') continue
    result[key] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  result['origin'] = targetOrigin
  result['referer'] = targetOrigin + '/'
  return result
}

function rewritePreviewResponseHeaders(
  headers: Headers,
  token: string,
  targetOrigin: string,
): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'x-frame-options') return
    if (lower === 'content-security-policy') return
    if (lower === 'content-security-policy-report-only') return
    if (lower === 'set-cookie') return
    if (lower === 'set-cookie2') return
    result[key] = value
  })

  const location = result['location']
  if (location) {
    const publicBase = `/previews/${encodeURIComponent(token)}`
    if (location.startsWith('/')) {
      result['location'] = `${publicBase}${location}`
    } else {
      try {
        const parsed = new URL(location)
        if (parsed.origin === targetOrigin) {
          result['location'] = `${publicBase}${parsed.pathname}${parsed.search}${parsed.hash}`
        }
      } catch { /* keep original */ }
    }
  }

  return result
}

function isHtmlContentType(contentType: string): boolean {
  const n = contentType.toLowerCase()
  return n.includes('text/html') || n.includes('application/xhtml+xml')
}

function isCssContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes('text/css')
}

function rewritePreviewBodyUrls(body: string, publicBase: string, kind: 'html' | 'css'): string {
  let result = body
  if (kind === 'html') {
    result = result
      .replace(/\b(src|href|action|poster|data)=(["'])\/(?!\/)([^"']*)\2/gi,
        (_match, attr: string, quote: string, pathValue: string) =>
          `${attr}=${quote}${publicBase}/${pathValue}${quote}`
      )
      .replace(/\bsrcset=(["'])([^"']*)\1/gi,
        (_match, quote: string, value: string) =>
          `srcset=${quote}${rewriteSrcsetPreviewUrls(value, publicBase)}${quote}`
      )
  }
  result = result.replace(/url\((\s*)(["']?)\/(?!\/)([^"')]+)\2(\s*)\)/gi,
    (_match, before: string, quote: string, pathValue: string, after: string) =>
      `url(${before}${quote}${publicBase}/${pathValue}${quote}${after}`
  )
  return result
}

function rewriteSrcsetPreviewUrls(value: string, publicBase: string): string {
  return value
    .split(',')
    .map((entry) => {
      const trimmed = entry.trimStart()
      if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return entry
      const leading = entry.slice(0, entry.length - trimmed.length)
      return `${leading}${publicBase}${trimmed}`
    })
    .join(',')
}
