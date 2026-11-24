import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { useSocket } from '../context/SocketContext'
import { sidebarTime } from '../lib/format'
import Avatar from './Avatar'
import { BoltIcon, LogoutIcon, SearchIcon, TickIcon } from './Icons'

function Row({ person, summary, active, online, isTyping, onClick }) {
  const last = summary?.lastMessage
  let preview = 'Say hello 👋'
  if (isTyping) preview = null
  else if (last) preview = last.deleted ? 'Message deleted' : `${last.fromMe ? 'You: ' : ''}${last.text}`

  return (
    <button className={`row ${active ? 'row--active' : ''}`} onClick={onClick}>
      <Avatar name={person.fullName} online={online} />
      <span className="row__main">
        <span className="row__top">
          <span className="row__name">{person.fullName}</span>
          {last && <span className={`row__time ${summary.unread ? 'row__time--unread' : ''}`}>{sidebarTime(last.createdAt)}</span>}
        </span>
        <span className="row__bottom">
          <span className={`row__preview ${isTyping ? 'row__preview--typing' : ''} ${last?.deleted ? 'row__preview--deleted' : ''}`}>
            {isTyping ? (
              'typing…'
            ) : (
              <>
                {last?.fromMe && !last.deleted && (
                  <TickIcon double={last.status !== 'sent' && last.status !== 'sending'} className={`tick tick--${last.status}`} width={14} height={14} />
                )}
                {preview}
              </>
            )}
          </span>
          {summary?.unread > 0 && <span className="badge">{summary.unread > 99 ? '99+' : summary.unread}</span>}
        </span>
      </span>
    </button>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { users, summaries, activeId, selectUser, typing, listLoading } = useChat()
  const { onlineIds } = useSocket()
  const [query, setQuery] = useState('')

  const { chats, people } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = users.filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    const withChat = matches
      .filter((u) => summaries[u.id]?.lastMessage)
      .sort((a, b) => new Date(summaries[b.id].lastMessage.createdAt) - new Date(summaries[a.id].lastMessage.createdAt))
    const without = matches.filter((u) => !summaries[u.id]?.lastMessage)
    return { chats: withChat, people: without }
  }, [users, summaries, query])

  const renderRow = (person) => (
    <Row
      key={person.id}
      person={person}
      summary={summaries[person.id]}
      active={person.id === activeId}
      online={onlineIds.has(person.id)}
      isTyping={!!typing[person.id]}
      onClick={() => selectUser(person.id)}
    />
  )

  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <div className="logo logo--small">
          <span className="logo__mark"><BoltIcon width={18} height={18} /></span>
          <span className="logo__text">Quick Chat</span>
        </div>
        <button className="icon-btn" onClick={logout} title="Log out" aria-label="Log out">
          <LogoutIcon />
        </button>
      </header>

      <div className="me">
        <Avatar name={user.fullName} size={40} online />
        <div className="me__text">
          <strong>{user.fullName}</strong>
          <span>{user.email}</span>
        </div>
      </div>

      <label className="search">
        <SearchIcon width={17} height={17} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" aria-label="Search people" />
      </label>

      <div className="list">
        {listLoading ? (
          <div className="skeletons" aria-label="Loading">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="list__empty">
            <strong>No one else is here yet</strong>
            <p>Open a second browser window (or a private one), sign up with another account, and chat with yourself in real time.</p>
          </div>
        ) : chats.length + people.length === 0 ? (
          <div className="list__empty"><p>Nobody matches “{query}”.</p></div>
        ) : (
          <>
            {chats.length > 0 && <div className="list__label">Chats</div>}
            {chats.map(renderRow)}
            {people.length > 0 && <div className="list__label">{chats.length > 0 ? 'More people' : 'People'}</div>}
            {people.map(renderRow)}
          </>
        )}
      </div>
    </aside>
  )
}
