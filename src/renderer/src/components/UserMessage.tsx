import type { Message } from '../../../shared/types'

interface UserMessageProps {
  message: Message
}

export function UserMessage({ message }: UserMessageProps) {
  const time = new Date(message.createdAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className="flex justify-end">
      <div className="max-w-[80%]">
        <div className="rounded-2xl rounded-br-md bg-primary/10 px-4 py-2.5 text-sm leading-relaxed text-gray-800 dark:bg-primary/20 dark:text-gray-200">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <div className="mt-1 text-right">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {time}
          </span>
        </div>
      </div>
    </div>
  )
}
