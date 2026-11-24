import { useLayoutEffect, useRef, useState } from 'react'
import { useChat } from '../context/ChatContext'
import { dayLabel } from '../lib/format'
import MessageBubble from './MessageBubble'
import { ArrowDownIcon } from './Icons'

const NEAR_BOTTOM_PX = 120
const SHOW_JUMP_PX = 300
const GROUP_WINDOW_MS = 5 * 60 * 1000

export default function MessageList({ partnerId, partnerName, thread, isTyping }) {
  const { meId, loadEarlier, deleteMessage, retryMessage, discardMessage } = useChat()
  const scrollRef = useRef(null)
  const stickToBottom = useRef(true)
  const anchor = useRef(null) // scroll position saved right before older messages are prepended
  const prev = useRef({ partnerId: null, firstId: null, lastId: null })
  const [showJump, setShowJump] = useState(false)

  const messages = thread?.messages || []
  const firstId = messages[0]?._id
  const lastId = messages.at(-1)?._id

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Decide how to scroll whenever the list of messages changes.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const p = prev.current

    if (p.partnerId !== partnerId || p.lastId == null) {
      scrollToBottom(false) // opened a chat (or first load) -> jump to the newest message
      stickToBottom.current = true
    } else if (anchor.current && firstId !== p.firstId) {
      // Older messages were added on top: keep the reader exactly where they were.
      el.scrollTop = el.scrollHeight - anchor.current.height + anchor.current.top
      anchor.current = null
    } else if (lastId !== p.lastId) {
      const lastIsMine = messages.at(-1)?.sender === meId
      if (lastIsMine || stickToBottom.current) scrollToBottom(true)
    }
    prev.current = { partnerId, firstId, lastId }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, firstId, lastId])

  // Typing bubble appeared and we're at the bottom -> keep it in view.
  useLayoutEffect(() => {
    if (isTyping && stickToBottom.current) scrollToBottom(true)
  }, [isTyping])

  function handleScroll() {
    const el = scrollRef.current
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottom.current = distance < NEAR_BOTTOM_PX
    setShowJump(distance > SHOW_JUMP_PX)
  }

  function handleLoadEarlier() {
    const el = scrollRef.current
    anchor.current = { height: el.scrollHeight, top: el.scrollTop }
    loadEarlier()
  }

  // Build the list with day dividers and "grouped" bubbles (same sender within 5 minutes).
  const rows = []
  let lastDay = null
  let before = null
  for (const m of messages) {
    const day = new Date(m.createdAt).toDateString()
    if (day !== lastDay) {
      rows.push(<div key={`day-${day}`} className="day"><span>{dayLabel(m.createdAt)}</span></div>)
      lastDay = day
      before = null
    }
    const groupStart = !before || before.sender !== m.sender || new Date(m.createdAt) - new Date(before.createdAt) > GROUP_WINDOW_MS
    rows.push(
      <MessageBubble
        key={m.tempId || m._id}
        message={m}
        mine={m.sender === meId}
        groupStart={groupStart}
        onDelete={deleteMessage}
        onRetry={retryMessage}
        onDiscard={discardMessage}
      />
    )
    before = m
  }

  return (
    <div className="messages-wrap">
      <div className="messages" ref={scrollRef} onScroll={handleScroll}>
        {thread?.hasMore && (
          <button className="load-earlier" onClick={handleLoadEarlier} disabled={thread.loadingMore}>
            {thread.loadingMore ? 'Loading…' : 'Load earlier messages'}
          </button>
        )}

        {thread?.loading && messages.length === 0 && (
          <div className="messages__state" aria-live="polite">Loading messages…</div>
        )}

        {thread?.loaded && messages.length === 0 && (
          <div className="messages__state">
            <strong>No messages yet</strong>
            <span>Say hi to {partnerName} 👋</span>
          </div>
        )}

        {rows}

        {isTyping && (
          <div className="bubble-row bubble-row--start" aria-live="polite">
            <div className="bubble typing-bubble" aria-label={`${partnerName} is typing`}><i /><i /><i /></div>
          </div>
        )}
      </div>

      {showJump && (
        <button className="jump" onClick={() => scrollToBottom(true)} aria-label="Jump to latest message">
          <ArrowDownIcon />
        </button>
      )}
    </div>
  )
}
