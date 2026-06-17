import { onMount } from 'solid-js'
import * as d3 from 'd3'

interface Commit {
  hash: string
  message: string
  author: string
  date: string
}

interface GitTreeData {
  isGitRepo: boolean
  branches: string[]
  branchCommits: Record<string, Commit[]>
}

interface GitTreeProps {
  data: GitTreeData
}

interface TreeNode {
  name: string
  children?: TreeNode[]
  commits?: Commit[]
}

export function GitTree(props: GitTreeProps) {
  let svgRef: SVGSVGElement | undefined

  onMount(() => {
    if (!svgRef || !props.data.isGitRepo) return

    const width = svgRef.clientWidth || 600
    const height = Math.max(400, props.data.branches.length * 80 + 100)

    const svg = d3.select(svgRef)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height)

    const g = svg.append('g').attr('transform', 'translate(40, 40)')

    const root: TreeNode = { name: props.data.branches[0]?.split('/')[0] || 'repo' }
    root.children = props.data.branches.map((branch) => ({
      name: branch,
      commits: props.data.branchCommits[branch] || [],
    }))

    const yStep = 60

    root.children.forEach((branch, bi) => {
      const y = bi * yStep
      const branchColor = d3.schemeTableau10[bi % 10]

      g.append('text')
        .attr('x', 0)
        .attr('y', y + 12)
        .attr('font-size', 11)
        .attr('font-weight', 'bold')
        .style('fill', 'var(--text-primary, #e5e5e5)')
        .text(branch.name)

      const commits = branch.commits || []
      if (commits.length === 0) {
        g.append('text')
          .attr('x', 10)
          .attr('y', y + 30)
          .attr('font-size', 10)
          .style('fill', 'var(--text-muted, #888)')
          .text('(no commits)')
        return
      }

      const xStart = 10
      const xStep = Math.min(160, Math.max(80, (width - 100) / Math.min(commits.length, 10)))
      const lineEnd = xStart + commits.length * xStep

      g.append('line')
        .attr('x1', xStart - 5)
        .attr('y1', y + 22)
        .attr('x2', lineEnd)
        .attr('y2', y + 22)
        .attr('stroke', branchColor)
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.4)

      commits.forEach((commit, ci) => {
        const cx = xStart + ci * xStep
        const cy = y + 22

        g.append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', 4)
          .attr('fill', branchColor)
          .attr('stroke', 'var(--border, #333)')
          .attr('stroke-width', 1)
          .style('cursor', 'pointer')

        g.append('text')
          .attr('x', cx)
          .attr('y', cy + 16)
          .attr('font-size', 9)
          .attr('text-anchor', 'start')
          .attr('transform', `rotate(30, ${cx}, ${cy + 16})`)
          .style('fill', 'var(--text-muted, #888)')
          .text(commit.hash)
      })
    })
  })

  return (
    <div class="overflow-auto">
      <Show when={!props.data.isGitRepo}>
        <p class="text-xs p-4" style="color:var(--text-muted)">Not a git repository</p>
      </Show>
      <svg ref={svgRef!} class="w-full" style="min-height:200px" />
    </div>
  )
}

import { Show } from 'solid-js'
