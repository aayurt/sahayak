import { Shield } from 'lucide-solid'
import { useChatStore } from '../../stores/chat'

interface Props {
  onClick: () => void
}

export function PermissionNotificationBanner(props: Props) {
  const { state } = useChatStore()
  const count = () => state.permissionQueue.length

  return (
    <button
      onClick={props.onClick}
      class="relative h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors hover:bg-accent"
      title={`${count()} pending permission${count() !== 1 ? 's' : ''}`}
    >
      <Shield class="h-4 w-4" />
      {count() > 0 && (
        <span class="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold bg-amber-500 text-white">
          {count() > 9 ? '9+' : count()}
        </span>
      )}
    </button>
  )
}
