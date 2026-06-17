import { createResource, createSignal, onCleanup, For, Show } from 'solid-js'
import { api } from '../lib/api-client'

function MetricsChart(props: { data: () => Array<{ cpu: number; ramUsed: number; ramTotal: number; timestamp: string }> }) {
  const items = () => props.data().slice().reverse()
  const w = 400
  const h = 140

  const viewBoxVal = '0 0 ' + w + ' ' + h

  const cpuPath = () => {
    const pts = items()
    if (!pts.length) return ''
    const maxCpu = Math.max(...pts.map(p => p.cpu), 10)
    return pts.map((p, i) => {
      const x = (i / Math.max(pts.length - 1, 1)) * w
      const y = h - (p.cpu / maxCpu) * h * 0.85 - 10
      return (i === 0 ? 'M' : 'L') + x + ',' + y
    }).join(' ')
  }

  const ramPath = () => {
    const pts = items()
    if (!pts.length) return ''
    const maxRam = Math.max(...pts.map(p => p.ramTotal), 1)
    return pts.map((p, i) => {
      const x = (i / Math.max(pts.length - 1, 1)) * w
      const y = h - (p.ramUsed / maxRam) * h * 0.85 - 10
      return (i === 0 ? 'M' : 'L') + x + ',' + y
    }).join(' ')
  }

  return (
    <svg viewBox={viewBoxVal} class="w-full h-full" preserveAspectRatio="none">
      <rect x="0" y="0" width={w} height={h} fill="transparent" />
      <polyline
        points={cpuPath()}
        fill="none"
        stroke="var(--color-chart-1, #3b82f6)"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
      <polyline
        points={ramPath()}
        fill="none"
        stroke="var(--color-chart-2, #22c55e)"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
      <text x="8" y="14" fill="var(--color-chart-1, #3b82f6)" font-size="10">CPU</text>
      <text x="50" y="14" fill="var(--color-chart-2, #22c55e)" font-size="10">RAM</text>
    </svg>
  )
}

export function DashboardPage() {
  const [metrics, { refetch }] = createResource(() => api.getSystemMetrics())
  const [liveMetrics, setLiveMetrics] = createSignal<Array<{ cpu: number; ramUsed: number; ramTotal: number; timestamp: string }>>([])

  const refreshInterval = setInterval(() => refetch(), 10000)
  onCleanup(() => clearInterval(refreshInterval))

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(protocol + '//' + location.host + '/ws')
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'metrics' && Array.isArray(msg.data)) {
        setLiveMetrics(msg.data.slice(0, 60))
      }
    } catch { /* ignore */ }
  }
  onCleanup(() => ws.close())

  const chartData = () => {
    const live = liveMetrics()
    if (live.length > 1) return live
    const fetched = metrics()
    return fetched && fetched.length > 1 ? fetched : []
  }

  const latest = () => {
    const d = chartData()
    return d.length ? d[d.length - 1] : null
  }

  const latestDisplay = () => {
    const l = latest()
    if (!l) return null
    const m = metrics()
    const first = m?.[0]
    return {
      cpu: l.cpu.toFixed(1),
      ramGb: l.ramUsed ? (l.ramUsed / 1024).toFixed(1) : '--',
      ramTotalGb: l.ramTotal ? (l.ramTotal / 1024).toFixed(1) : '--',
      diskUsed: first?.diskUsed ? (first.diskUsed / 1024).toFixed(1) : '--',
      diskTotal: first?.diskTotal ? (first.diskTotal / 1024).toFixed(1) : '--',
    }
  }

  return (
    <div class="p-6 overflow-y-auto h-full">
      <h1 class="text-lg font-semibold mb-4">Dashboard</h1>

      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="card p-4">
          <div class="text-xs" style="color:var(--text-muted)">CPU</div>
          <div class="text-2xl font-mono mt-1">{latestDisplay()?.cpu || '--'}%</div>
        </div>
        <div class="card p-4">
          <div class="text-xs" style="color:var(--text-muted)">RAM</div>
          <div class="text-2xl font-mono mt-1">
            {latestDisplay()?.ramGb || '--'} / {latestDisplay()?.ramTotalGb || '--'} GB
          </div>
        </div>
        <div class="card p-4">
          <div class="text-xs" style="color:var(--text-muted)">Disk</div>
          <div class="text-2xl font-mono mt-1">
            {latestDisplay()?.diskUsed || '--'} / {latestDisplay()?.diskTotal || '--'} GB
          </div>
        </div>
        <div class="card p-4">
          <div class="text-xs" style="color:var(--text-muted)">Status</div>
          <div class="text-lg mt-1" style="color:var(--success)">Running</div>
        </div>
      </div>

      <div class="card p-4 mb-6" style="height:200px">
        <div class="text-xs mb-2" style="color:var(--text-muted)">CPU & RAM (last {chartData().length} samples)</div>
        <Show when={chartData().length > 1} fallback={
          <div class="flex items-center justify-center h-32 text-xs" style="color:var(--text-muted)">
            Collecting data...
          </div>
        }>
          <MetricsChart data={chartData} />
        </Show>
      </div>

      <h2 class="text-sm font-medium mb-2" style="color:var(--text-secondary)">Recent Metrics</h2>
      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr style="border-bottom: 1px solid var(--border)">
              <th class="text-left px-3 py-2" style="color:var(--text-muted)">Time</th>
              <th class="text-right px-3 py-2" style="color:var(--text-muted)">CPU</th>
              <th class="text-right px-3 py-2" style="color:var(--text-muted)">RAM</th>
            </tr>
          </thead>
          <tbody>
            <For each={metrics()}>
              {(m) => (
                <tr style="border-bottom: 1px solid var(--border)">
                  <td class="px-3 py-2 font-mono text-xs" style="color:var(--text-muted)">
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </td>
                  <td class="px-3 py-2 text-right">{m.cpu.toFixed(1)}%</td>
                  <td class="px-3 py-2 text-right">{(m.ramUsed / 1024).toFixed(1)} GB</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  )
}
