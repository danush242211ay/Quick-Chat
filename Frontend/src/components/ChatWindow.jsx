import { useChat } from '../context/ChatContext'
import { useSocket } from '../context/SocketContext'
import { lastSeenLabel } from '../lib/format'
import Avatar from './Avatar'
import MessageInput from './MessageInput'
import MessageList from './MessageList'
import { BackIcon, BoltIcon } from './Icons'

export default function ChatWindow() {
  const { activeUser, activeId, threads, typing, selectUser } = useChat()
  const { onlineIds } = useSocket()

  if (!activeUser) {
    return (
      <section className="chat chat--empty">
        <div className="empty">
          <span className="empty__mark"><BoltIcon width={34} height={34} /></span>
          <h2>Pick a conversation</h2>
          <p>Choose someone from the list to start chatting. Messages arrive instantly — no refreshing.</p>
        </div>
      </section>
    )
  }

  const online = onlineIds.has(activeUser.id)
  const isTyping = !!typing[activeId]
  const status = isTyping ? 'typing…' : online ? 'online' : lastSeenLabel(activeUser.lastSeen)

  return (
    <section className="chat">
      <header className="chat__header">
        <button className="icon-btn back-btn" onClick={() => selectUser(null)} aria-label="Back to conversations">
          <BackIcon />
        </button>
        <Avatar name={activeUser.fullName} online={online} />
        <div className="chat__title">
          <strong>{activeUser.fullName}</strong>
          <span className={`chat__status ${isTyping ? 'chat__status--typing' : online ? 'chat__status--online' : ''}`}>{status}</span>
        </div>
      </header>

      {/* key=activeId -> a fresh list/composer (scroll position, draft text) for every conversation */}
      <MessageList key={activeId} partnerId={activeId} partnerName={activeUser.fullName} thread={threads[activeId]} isTyping={isTyping} />
      <MessageInput key={`in-${activeId}`} partnerId={activeId} partnerName={activeUser.fullName} />
    </section>
  )
}
