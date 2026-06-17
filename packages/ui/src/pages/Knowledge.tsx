import { createResource, createSignal, createEffect, For, Show, onMount, onCleanup } from 'solid-js'
import * as d3 from 'd3'
import { useSearchParams } from '@solidjs/router'
import { api } from '../lib/api-client'
import { VaultBrowser } from '../components/knowledge/VaultBrowser'

const TYPE_COLORS: Record<string, string> = {
  file: '#6b7280',
  function: '#3b82f6',
  class: '#22c55e',
  interface: '#a855f7',
  type: '#f59e0b',
  struct: '#22c55e',
  enum: '#f97316',
  trait: '#a855f7',
}

const TABS = [
  { id: 'graph', label: 'Knowledge Graph' },
  { id: 'vault', label: 'Vault Browser' },
]

export function KnowledgePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = createSignal(searchParams.tab === 'vault' ? 'vault' : 'graph')
  const [projects, { refetch: refetchProjects }] = createResource(() => api.listProjects())
  const [selectedProjectId, setSelectedProjectId] = createSignal('')
  const [showAddForm, setShowAddForm] = createSignal(false)
  const [addPath, setAddPath] = createSignal('')
  const [addName, setAddName] = createSignal('')
  const [searchQuery, setSearchQuery] = createSignal('')
  const [searchResults, setSearchResults] = createSignal<any[] | null>(null)
  const [selectedNode, setSelectedNode] = createSignal<any | null>(null)
  const [nodeCount, setNodeCount] = createSignal(0)
  const [edgeCount, setEdgeCount] = createSignal(0)

  const [graphData, { refetch: refetchGraph }] = createResource(selectedProjectId, async (pid) => {
    if (!pid) return null
    const result = await api.getGraph(pid)
    setNodeCount(result.nodes.length)
    setEdgeCount(result.edges.length)
    return result
  })

  let svgRef: SVGSVGElement | undefined
  let simulation: d3.Simulation<any, any> | null = null
  let linkElements: d3.Selection<any, any, any, any> | null = null
  let nodeElements: d3.Selection<any, any, any, any> | null = null
  let labelElements: d3.Selection<any, any, any, any> | null = null
  let zoomG: d3.Selection<SVGGElement, unknown, null, undefined> | null = null

  const addProject = async () => {
    if (!addPath() || !addName()) return
    try {
      const project = await api.addProject(addPath(), addName())
      setShowAddForm(false)
      setAddPath('')
      setAddName('')
      refetchProjects()
      setSelectedProjectId(project.id)
    } catch (e) {
      console.error('Failed to add project:', e)
    }
  }

  const removeProject = async (id: string) => {
    await api.deleteProject(id)
    refetchProjects()
    if (selectedProjectId() === id) setSelectedProjectId('')
  }

  const scan = async (id: string) => {
    try {
      await api.scanProject(id)
      refetchGraph()
      refetchProjects()
    } catch (e) {
      console.error('Scan failed:', e)
    }
  }

  const doSearch = async () => {
    const pid = selectedProjectId()
    if (!pid || !searchQuery()) {
      setSearchResults(null)
      return
    }
    try {
      const results = await api.searchNodes(pid, searchQuery())
      setSearchResults(results)
    } catch (e) {
      console.error('Search failed:', e)
    }
  }

  // Initialize SVG once
  onMount(() => {
    if (!svgRef) return

    const svg = d3.select(svgRef)
    const width = svgRef.clientWidth
    const height = svgRef.clientHeight

    svg.attr('width', width).attr('height', height)

    zoomG = svg.append('g')

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        zoomG!.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Arrow marker
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 18)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .style('fill', 'var(--color-muted-foreground)')

    // Resize
    const ro = new ResizeObserver(() => {
      if (svgRef) {
        const w = svgRef.clientWidth
        const h = svgRef.clientHeight
        svg.attr('width', w).attr('height', h)
      }
    })
    ro.observe(svgRef.parentElement!)

    onCleanup(() => {
      if (simulation) simulation.stop()
      ro.disconnect()
    })
  })

  // React to graph data changes
  createEffect(() => {
    const data = graphData()
    if (!zoomG) return

    zoomG.selectAll('*').remove()
    if (simulation) {
      simulation.stop()
      simulation = null
    }
    if (!data || !data.nodes.length) return

    const width = svgRef!.clientWidth || 600
    const height = svgRef!.clientHeight || 400

    const nodes = data.nodes.map((n: any) => ({ ...n }))
    const links = data.edges.map((e: any) => ({
      source: e.sourceId,
      target: e.targetId,
      relation: e.relation,
    }))

    linkElements = zoomG.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .style('stroke', 'var(--color-border)')
      .attr('stroke-width', 1)
      .style('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrowhead)')

    labelElements = zoomG.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text((d: any) => d.label.length > 20 ? d.label.slice(0, 20) + '...' : d.label)
      .attr('font-size', 10)
      .style('fill', 'var(--color-muted-foreground)')
      .attr('text-anchor', 'middle')
      .attr('dy', -12)

    nodeElements = zoomG.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d: any) => d.type === 'file' ? 6 : 5)
      .style('fill', (d: any) => TYPE_COLORS[d.type] || 'var(--color-muted-foreground)')
      .style('stroke', 'var(--color-border)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('click', (_event: any, d: any) => setSelectedNode(d))
      .call(
        d3.drag<SVGCircleElement, any>()
          .on('start', (event, d) => {
            if (!event.active) simulation!.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation!.alphaTarget(0)
            d.fx = null
            d.fy = null
          }) as any
      )

    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(20))

    simulation.on('tick', () => {
      linkElements!
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      nodeElements!
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y)

      labelElements!
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y)
    })
  })

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div class="flex gap-0 px-4 border-b shrink-0" style="background:var(--bg-secondary);border-color:var(--border)">
        <For each={TABS}>
          {(tab) => (
            <button
              class="px-4 py-2 text-xs font-medium border-b-2 cursor-pointer"
              style={`color:${activeTab() === tab.id ? 'var(--accent)' : 'var(--text-muted)'};border-color:${activeTab() === tab.id ? 'var(--accent)' : 'transparent'}`}
              onClick={() => { setActiveTab(tab.id); setSearchParams({ tab: tab.id === 'vault' ? 'vault' : undefined }) }}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      {activeTab() === 'vault' ? (
        <VaultBrowser />
      ) : (
      <div class="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div class="w-64 shrink-0 p-4 overflow-y-auto border-r" style="background:var(--bg-secondary);border-color:var(--border)">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-medium" style="color:var(--text-secondary)">Projects</h2>
          <button class="btn-ghost text-xs" onClick={() => setShowAddForm(!showAddForm())}>+</button>
        </div>

        <Show when={showAddForm()}>
          <div class="space-y-2 mb-3 p-2 card">
            <input class="input w-full text-xs" placeholder="Name" value={addName()} onInput={(e) => setAddName(e.currentTarget.value)} />
            <input class="input w-full text-xs" placeholder="/path/to/project" value={addPath()} onInput={(e) => setAddPath(e.currentTarget.value)} />
            <button class="btn text-xs w-full" onClick={addProject}>Add</button>
          </div>
        </Show>

        <div class="space-y-1">
          <For each={projects()}>
            {(p: any) => (
              <div
                class="px-2 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between"
                classList={{ 'active': selectedProjectId() === p.id }}
                onClick={() => { setSelectedProjectId(p.id); setSelectedNode(null); setSearchResults(null) }}
              >
                <span class="truncate">{p.name}</span>
                <div class="flex gap-1 shrink-0">
                  <button class="btn-ghost text-xs p-0.5" onClick={(e) => { e.stopPropagation(); scan(p.id) }} title="Scan">&#8635;</button>
                  <button class="btn-ghost text-xs p-0.5" style="color:var(--danger,#ef4444)" onClick={(e) => { e.stopPropagation(); removeProject(p.id) }} title="Remove">&times;</button>
                </div>
              </div>
            )}
          </For>
          <Show when={projects()?.length === 0}>
            <p class="text-xs" style="color:var(--text-muted)">No projects added</p>
          </Show>
        </div>

        <hr class="my-3" style="border-color:var(--border)" />

        {/* Search */}
        <div class="space-y-2">
          <input
            class="input w-full text-xs"
            placeholder="Search symbols..."
            value={searchQuery()}
            onInput={(e) => {
              setSearchQuery(e.currentTarget.value)
              if (!e.currentTarget.value) setSearchResults(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          <button class="btn text-xs w-full" onClick={doSearch}>Search</button>
        </div>

        <Show when={searchResults() !== null}>
          <div class="mt-3 space-y-1">
            <div class="text-xs font-medium" style="color:var(--text-secondary)">Results ({searchResults()?.length})</div>
            <For each={searchResults()}>
              {(n: any) => (
                <div
                  class="px-2 py-1 rounded text-xs cursor-pointer"
                  style="background:var(--bg-primary)"
                  onClick={() => setSelectedNode(n)}
                >
                  <span class="font-medium">{n.label}</span>
                  <span class="ml-1" style={{ color: TYPE_COLORS[n.type] || 'var(--color-muted-foreground)' }}>({n.type})</span>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={selectedProjectId() && graphData()}>
          <div class="mt-3 text-xs" style="color:var(--text-muted)">
            {nodeCount()} nodes · {edgeCount()} edges
          </div>
        </Show>
      </div>

      {/* Graph area */}
      <div class="flex-1 relative overflow-hidden">
        <svg ref={svgRef!} class="w-full h-full" style="background:var(--color-background)" />

        {/* Node detail panel */}
        <Show when={selectedNode()}>
          <div
            class="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 p-4 rounded-lg shadow-lg z-10 bg-card border"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[selectedNode()?.type] || 'var(--color-muted-foreground)' }} />
                <span class="text-sm font-medium">{selectedNode()?.label}</span>
              </div>
              <button class="btn-ghost text-xs" onClick={() => setSelectedNode(null)}>&times;</button>
            </div>
            <div class="text-xs mb-2" style="color:var(--text-muted)">
              Type: {selectedNode()?.type} · {(selectedNode()?.metadata as any)?.file || ''} : {(selectedNode()?.metadata as any)?.line || ''}
            </div>
            <pre class="text-xs whitespace-pre-wrap max-h-40 overflow-y-auto p-2 rounded bg-muted text-muted-foreground">
              {selectedNode()?.content || 'No content'}
            </pre>
          </div>
        </Show>
      </div>
      </div>
      )}
    </div>
  )
}
