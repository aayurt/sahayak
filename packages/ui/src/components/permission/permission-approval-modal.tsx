import { For, Show } from 'solid-js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useChatStore, sendPermissionResponse } from '../../stores/chat'
import type { PermissionReply } from '../../types/permission'

interface Props {
  open: boolean
  onClose: () => void
}

export function PermissionApprovalModal(props: Props) {
  const { state } = useChatStore()

  function handleReply(permId: string, reply: PermissionReply) {
    if (!state.currentSessionId) return
    sendPermissionResponse(state.currentSessionId, permId, reply)
    if (state.permissionQueue.length <= 1) {
      props.onClose()
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o: boolean) => { if (!o) props.onClose() }}>
      <DialogContent class="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            Pending Permissions
            <Show when={state.permissionQueue.length > 1}>
              <span class="ml-2 text-xs font-normal text-muted-foreground">
                ({state.permissionQueue.length} total)
              </span>
            </Show>
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-3 max-h-[60vh] overflow-y-auto">
          <For each={state.permissionQueue}>
            {(perm, i) => (
              <div
                class="p-3 rounded-lg border"
                classList={{
                  'border-amber-500/50 bg-amber-500/5': i() === 0,
                  'border-border/40 opacity-60': i() > 0,
                }}
              >
                <div class="flex items-start justify-between gap-2 mb-2">
                  <div class="text-sm font-medium text-foreground flex-1">
                    {perm.title || 'Permission request'}
                  </div>
                  <Show when={i() === 0}>
                    <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                      Active
                    </span>
                  </Show>
                </div>

                <Show when={perm.permission}>
                  <div class="text-xs text-muted-foreground mb-1">
                    Action: <code class="text-[11px] bg-muted px-1 rounded">{perm.permission}</code>
                  </div>
                </Show>

                <Show when={perm.patterns && perm.patterns.length > 0}>
                  <div class="text-xs text-muted-foreground mb-2">
                    Resources:{' '}
                    <code class="text-[11px] bg-muted px-1 rounded">
                      {perm.patterns!.join(', ')}
                    </code>
                  </div>
                </Show>

                <Show when={i() === 0}>
                  <div class="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="default"
                      class="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => handleReply(perm.id, 'once')}
                    >
                      Allow Once
                      <span class="text-[10px] opacity-60 ml-1">Enter</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      class="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleReply(perm.id, 'always')}
                    >
                      Always Allow
                      <span class="text-[10px] opacity-60 ml-1">A</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReply(perm.id, 'reject')}
                    >
                      Deny
                      <span class="text-[10px] opacity-60 ml-1">D</span>
                    </Button>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>

        <div class="flex items-center justify-between text-[10px] text-muted-foreground mt-2">
          <span>Enter: Allow Once</span>
          <span>A: Always Allow</span>
          <span>D: Deny</span>
          <span>Esc: Close</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
