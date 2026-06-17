import { Request, Response, NextFunction } from 'express'
import { getSidecar } from './sidecar'
import { createProxyMiddleware as httpProxy } from 'http-proxy-middleware'

export function createProxyMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const scId = req.params.id
    const sc = getSidecar(scId)
    if (!sc) return res.status(404).json({ error: 'Sidecar not found' })

    const target = `http://localhost:${sc.port}`
    const proxy = httpProxy({
      target,
      changeOrigin: true,
      pathRewrite: (path) => path.replace(`/sidecar/${scId}`, ''),
      ws: true,
    })
    return proxy(req, res, next)
  }
}
