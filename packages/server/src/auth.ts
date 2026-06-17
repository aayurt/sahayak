import { Request, Response, NextFunction } from 'express'

let serverPassword: string | null = null

export function setServerPassword(password: string | null) {
  serverPassword = password
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!serverPassword) return next()

  const token = req.cookies?.sahayak_token || req.headers['x-sahayak-token']
  if (token === serverPassword) return next()

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (req.path === '/login') return next()
  if (req.method === 'GET' && req.path.startsWith('/assets/')) return next()
  res.redirect('/login')
}
