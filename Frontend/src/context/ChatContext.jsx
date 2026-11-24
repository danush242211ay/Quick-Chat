import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import api, { errorMessage } from '../api/client'
import { useAuth } from './AuthContext'
import { useSocket } from './SocketContext'

/*
  ChatContext = the "brain" of the app.

  It keeps four pieces of state and keeps them in sync with the server:
    users      -> everyone I can chat with                       [{ id, fullName, lastSeen, ... }]
    summaries  -> sidebar info per person                        { [userId]: { lastMessage, unread } }
    threads    -> loaded messages per conversation              { [userId]: { messages, hasMore, ... } }
    typing     -> who is typing to me right now                  { [userId]: true }

  Data arrives two ways:
    1. HTTP (axios)  -> history: users, conversations, older messages        (pull)
    2. Socket.io     -> everything live: new messages, ticks, typing, ...    (push)
*/

const ChatContext = createContext(null)

const PAGE_SIZE = 30
const SEND_TIMEOUT_MS = 8000
const TYPING_EXPIRY_MS = 5000

// API conversation list -> { [userId]: { unread, lastMessage } }
const toSummaryMap = (conversations) =>
  Object.fromEntries(conversations.map((c) => [c.userId, { unread: c.unread, lastMessage: c.lastMessage }]))

const makeLast = (m, meId) => ({
  _id: m._id,
  text: m.text,
  deleted: m.deleted,
  status: m.status,
  fromMe: m.sender === meId,
  createdAt: m.createdAt,
})

// Immutable helper: change every message of one thread with `fn`.
const patchThread = (threads, partnerId, fn) => {
  const t = threads[partnerId]
  if (!t) return threads
  return { ...threads, [partnerId]: { ...t, messages: t.messages.map(fn) } }
}

// Immutable helper: change the "last message" preview of one conversation.
const patchLast = (summaries, partnerId, fn) => {
  const s = summaries[partnerId]
  if (!s?.lastMessage) return summaries
  return { ...summaries, [partnerId]: { ...s, lastMessage: fn(s.lastMessage) } }
}

export function ChatProvider({ children }) {
  const { user } = useAuth()
  const { socket, connected } = useSocket()
  const meId = user.id

  const [users, setUsers] = useState([])
  const [summaries, setSummaries] = useState({})
  const [threads, setThreads] = useState({})
  const [typing, setTyping] = useState({})
  const [activeId, setActiveId] = useState(null)
  const [listLoading, setListLoading] = useState(true)
  const [notice, setNotice] = useState('')

  // Refs hold values that socket handlers need to read at the moment an event arrives,
  // without re-subscribing every time they change.
  const activeIdRef = useRef(null)
  const usersRef = useRef([])
  const typingTimers = useRef({})
  const noticeTimer = useRef(null)
  const wasConnected = useRef(false)

  useEffect(() => {
    usersRef.current = users
  }, [users])

  const flash = useCallback((message) => {
    setNotice(message)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 4000)
  }, [])

  /* ------------------------------------------------------------------ */
  /* HTTP loaders (history)                                              */
  /* ------------------------------------------------------------------ */
  const loadUsers = useCallback(async () => {
    const { data } = await api.get('/users')
    setUsers(data.users)
  }, [])

  const loadSummaries = useCallback(async () => {
    const { data } = await api.get('/messages/conversations')
    setSummaries(toSummaryMap(data.conversations))
  }, [])

  // First load: the people list and the sidebar summaries, fetched in parallel.
  useEffect(() => {
    let cancelled = false
    Promise.all([api.get('/users'), api.get('/messages/conversations')])
      .then(([usersRes, convRes]) => {
        if (cancelled) return
        setUsers(usersRes.data.users)
        setSummaries(toSummaryMap(convRes.data.conversations))
      })
      .catch((err) => !cancelled && flash(errorMessage(err)))
      .finally(() => !cancelled && setListLoading(false))
    return () => {
      cancelled = true
    }
  }, [flash])

  // Load the newest page of one conversation.
  const loadThread = useCallback(
    async (partnerId) => {
      setThreads((prev) => ({ ...prev, [partnerId]: { messages: [], hasMore: false, ...prev[partnerId], loading: true } }))
      try {
        const { data } = await api.get(`/messages/conversation/${partnerId}`, { params: { limit: PAGE_SIZE } })
        setThreads((prev) => {
          const existing = prev[partnerId]?.messages || []
          const fetchedIds = new Set(data.messages.map((m) => m._id))
          const newestFetched = data.messages.at(-1)?.createdAt
          // Keep messages that arrived over the socket WHILE we were loading, plus unsent ones.
          const extras = existing.filter(
            (m) =>
              !fetchedIds.has(m._id) &&
              (m.status === 'sending' || m.status === 'failed' || !newestFetched || new Date(m.createdAt) > new Date(newestFetched))
          )
          return {
            ...prev,
            [partnerId]: { messages: [...data.messages, ...extras], hasMore: data.hasMore, loading: false, loaded: true },
          }
        })
      } catch (err) {
        setThreads((prev) => ({ ...prev, [partnerId]: { ...prev[partnerId], loading: false, loaded: false } }))
        flash(errorMessage(err))
      }
    },
    [flash]
  )

  // "Load earlier messages" button: fetch the page before the oldest message we have.
  const loadEarlier = useCallback(async () => {
    const id = activeIdRef.current
    const thread = threads[id]
    if (!thread || thread.loadingMore || !thread.hasMore) return
    const oldest = thread.messages.find((m) => !m.tempId)
    if (!oldest) return

    setThreads((prev) => ({ ...prev, [id]: { ...prev[id], loadingMore: true } }))
    try {
      const { data } = await api.get(`/messages/conversation/${id}`, { params: { limit: PAGE_SIZE, before: oldest.createdAt } })
      setThreads((prev) => {
        const t = prev[id]
        const have = new Set(t.messages.map((m) => m._id))
        const older = data.messages.filter((m) => !have.has(m._id))
        return { ...prev, [id]: { ...t, messages: [...older, ...t.messages], hasMore: data.hasMore, loadingMore: false } }
      })
    } catch (err) {
      setThreads((prev) => ({ ...prev, [id]: { ...prev[id], loadingMore: false } }))
      flash(errorMessage(err))
    }
  }, [threads, flash])

  /* ------------------------------------------------------------------ */
  /* Small state helpers                                                 */
  /* ------------------------------------------------------------------ */
  const markRead = useCallback(
    (partnerId) => {
      setSummaries((prev) =>
        prev[partnerId]?.unread ? { ...prev, [partnerId]: { ...prev[partnerId], unread: 0 } } : prev
      )
      socket?.emit('messages:read', { from: partnerId }) // server tells the sender -> blue ticks
    },
    [socket]
  )

  const appendMessage = useCallback((partnerId, msg) => {
    setThreads((prev) => {
      const t = prev[partnerId]
      if (!t) return prev // conversation not opened yet: it will be fetched fresh when opened
      if (t.messages.some((m) => m._id === msg._id)) return prev // already have it (dedupe)
      return { ...prev, [partnerId]: { ...t, messages: [...t.messages, msg] } }
    })
  }, [])

  const clearTyping = useCallback((userId) => {
    clearTimeout(typingTimers.current[userId])
    setTyping((prev) => {
      if (!prev[userId]) return prev
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }, [])

  /* ------------------------------------------------------------------ */
  /* Opening a chat                                                      */
  /* ------------------------------------------------------------------ */
  const selectUser = useCallback(
    (id) => {
      activeIdRef.current = id
      setActiveId(id)
      if (!id) return
      if (!threads[id]?.loaded && !threads[id]?.loading) loadThread(id)
      markRead(id)
    },
    [threads, loadThread, markRead]
  )

  /* ------------------------------------------------------------------ */
  /* Sending (optimistic UI)                                             */
  /* ------------------------------------------------------------------ */
  const confirmSent = useCallback(
    (partnerId, tempId, real) => {
      setThreads((prev) => {
        const t = prev[partnerId]
        if (!t) return prev
        const alreadyThere = t.messages.some((m) => m._id === real._id)
        const messages = alreadyThere
          ? t.messages.filter((m) => m.tempId !== tempId)
          : t.messages.map((m) => (m.tempId === tempId ? real : m))
        return { ...prev, [partnerId]: { ...t, messages } }
      })
      setSummaries((prev) => ({
        ...prev,
        [partnerId]: { unread: prev[partnerId]?.unread || 0, lastMessage: makeLast(real, meId) },
      }))
    },
    [meId]
  )

  const failSent = useCallback(
    (partnerId, tempId, reason) => {
      setThreads((prev) => patchThread(prev, partnerId, (m) => (m.tempId === tempId ? { ...m, status: 'failed' } : m)))
      flash(reason || 'Message failed to send')
    },
    [flash]
  )

  const deliver = useCallback(
    (to, text, tempId) => {
      if (socket?.connected) {
        // Over the socket, with an acknowledgement callback: the server answers "ok" or an error.
        socket.timeout(SEND_TIMEOUT_MS).emit('message:send', { to, text, tempId }, (err, res) => {
          if (err) return failSent(to, tempId, 'The server took too long to respond')
          if (!res.ok) return failSent(to, tempId, res.error)
          confirmSent(to, tempId, res.message)
        })
      } else {
        // Socket is down -> fall back to plain HTTP so the user can still send.
        api
          .post('/messages/send', { to, text })
          .then((res) => confirmSent(to, tempId, res.data.message))
          .catch((err) => failSent(to, tempId, errorMessage(err)))
      }
    },
    [socket, confirmSent, failSent]
  )

  const sendMessage = useCallback(
    (text) => {
      const to = activeIdRef.current
      const clean = text.trim()
      if (!to || !clean) return

      // 1. Show it immediately (grey clock) so the UI feels instant...
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const optimistic = {
        _id: tempId,
        tempId,
        sender: meId,
        receiver: to,
        text: clean,
        status: 'sending',
        deleted: false,
        createdAt: new Date().toISOString(),
      }
      appendMessage(to, optimistic)
      setSummaries((prev) => ({
        ...prev,
        [to]: { unread: prev[to]?.unread || 0, lastMessage: makeLast(optimistic, meId) },
      }))

      // 2. ...then actually send it. confirmSent() swaps the temp message for the real one.
      deliver(to, clean, tempId)
    },
    [meId, appendMessage, deliver]
  )

  const retryMessage = useCallback(
    (tempId) => {
      const id = activeIdRef.current
      const msg = threads[id]?.messages.find((m) => m.tempId === tempId)
      if (!msg) return
      setThreads((prev) => ({ ...prev, [id]: { ...prev[id], messages: prev[id].messages.filter((m) => m.tempId !== tempId) } }))
      sendMessage(msg.text)
    },
    [threads, sendMessage]
  )

  const discardMessage = useCallback((tempId) => {
    const id = activeIdRef.current
    setThreads((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], messages: prev[id].messages.filter((m) => m.tempId !== tempId) } } : prev))
  }, [])

  // The server answers with a "message:deleted" event to both people, which updates the UI.
  const deleteMessage = useCallback(
    async (messageId) => {
      try {
        await api.delete(`/messages/${messageId}`)
      } catch (err) {
        flash(errorMessage(err))
      }
    },
    [flash]
  )

  const sendTyping = useCallback(
    (to, isTyping) => {
      if (to && socket?.connected) socket.emit('typing', { to, isTyping })
    },
    [socket]
  )

  /* ------------------------------------------------------------------ */
  /* Live events from the server                                         */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!socket) return undefined

    // A message was created (someone sent me one, or I sent one from another tab).
    const onNewMessage = (msg) => {
      const mine = msg.sender === meId
      const partnerId = mine ? msg.receiver : msg.sender
      const isOpen = activeIdRef.current === partnerId && document.visibilityState === 'visible'

      appendMessage(partnerId, msg)
      setSummaries((prev) => {
        const unread = prev[partnerId]?.unread || 0
        return {
          ...prev,
          [partnerId]: { lastMessage: makeLast(msg, meId), unread: mine ? unread : isOpen ? 0 : unread + 1 },
        }
      })

      if (!mine) {
        clearTyping(partnerId)
        if (isOpen) socket.emit('messages:read', { from: partnerId })
        // A brand-new person messaged us before we knew about them? refresh the people list.
        if (!usersRef.current.some((u) => u.id === partnerId)) loadUsers().catch(() => {})
      }
    }

    // The receiver came online / got the message -> single tick becomes double tick.
    const onDelivered = ({ by }) => {
      const upgrade = (m) => (m.sender === meId && m.status === 'sent' ? { ...m, status: 'delivered' } : m)
      setThreads((prev) => patchThread(prev, by, upgrade))
      setSummaries((prev) => patchLast(prev, by, (l) => (l.fromMe && l.status === 'sent' ? { ...l, status: 'delivered' } : l)))
    }

    // The receiver opened the chat -> ticks turn blue.
    const onRead = ({ by }) => {
      const upgrade = (m) => (m.sender === meId && m.status !== 'read' && m.status !== 'sending' && m.status !== 'failed' ? { ...m, status: 'read' } : m)
      setThreads((prev) => patchThread(prev, by, upgrade))
      setSummaries((prev) => patchLast(prev, by, (l) => (l.fromMe && l.status !== 'read' ? { ...l, status: 'read' } : l)))
    }

    // I read this chat in another tab -> clear the unread badge here too.
    const onConversationRead = ({ with: partnerId }) => {
      setSummaries((prev) =>
        prev[partnerId]?.unread ? { ...prev, [partnerId]: { ...prev[partnerId], unread: 0 } } : prev
      )
    }

    const onDeleted = ({ messageId, with: partnerId }) => {
      setThreads((prev) => patchThread(prev, partnerId, (m) => (m._id === messageId ? { ...m, deleted: true, text: '' } : m)))
      setSummaries((prev) => patchLast(prev, partnerId, (l) => (l._id === messageId ? { ...l, deleted: true, text: '' } : l)))
    }

    const onTyping = ({ from, isTyping }) => {
      clearTimeout(typingTimers.current[from])
      if (!isTyping) return clearTyping(from)
      setTyping((prev) => ({ ...prev, [from]: true }))
      // Safety net: if the "stopped typing" event is lost, hide the indicator anyway.
      typingTimers.current[from] = setTimeout(() => clearTyping(from), TYPING_EXPIRY_MS)
    }

    // Someone registered while I'm online -> add them to my list without a refresh.
    const onUserNew = (newUser) => {
      if (newUser.id === meId) return
      setUsers((prev) =>
        prev.some((u) => u.id === newUser.id) ? prev : [...prev, newUser].sort((a, b) => a.fullName.localeCompare(b.fullName))
      )
    }

    // Presence changes arrive in SocketContext; here we only keep "last seen" fresh.
    const onPresence = ({ userId, online, lastSeen }) => {
      if (online) return
      clearTyping(userId)
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, lastSeen } : u)))
    }

    socket.on('message:new', onNewMessage)
    socket.on('messages:delivered', onDelivered)
    socket.on('messages:read', onRead)
    socket.on('conversation:read', onConversationRead)
    socket.on('message:deleted', onDeleted)
    socket.on('typing', onTyping)
    socket.on('user:new', onUserNew)
    socket.on('presence:update', onPresence)

    return () => {
      socket.off('message:new', onNewMessage)
      socket.off('messages:delivered', onDelivered)
      socket.off('messages:read', onRead)
      socket.off('conversation:read', onConversationRead)
      socket.off('message:deleted', onDeleted)
      socket.off('typing', onTyping)
      socket.off('user:new', onUserNew)
      socket.off('presence:update', onPresence)
    }
  }, [socket, meId, appendMessage, clearTyping, loadUsers])

  /* ------------------------------------------------------------------ */
  /* Reconnect: we may have missed events while offline -> re-sync        */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!connected) return
    if (wasConnected.current) {
      const id = activeIdRef.current
      Promise.all([loadUsers(), loadSummaries()])
        .then(() => {
          setThreads({}) // drop cached threads; they may be stale
          if (id) {
            loadThread(id)
            markRead(id)
          }
        })
        .catch(() => {})
    }
    wasConnected.current = true
  }, [connected, loadUsers, loadSummaries, loadThread, markRead])

  // Opening the tab / window again counts as "seen".
  useEffect(() => {
    const onVisible = () => {
      const id = activeIdRef.current
      if (id && document.visibilityState === 'visible') markRead(id)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [markRead])

  // "(3) Quick Chat" in the browser tab title.
  const totalUnread = Object.values(summaries).reduce((sum, s) => sum + (s.unread || 0), 0)
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Quick Chat` : 'Quick Chat'
  }, [totalUnread])

  const activeUser = users.find((u) => u.id === activeId) || null

  const value = {
    meId,
    users,
    summaries,
    threads,
    typing,
    activeId,
    activeUser,
    listLoading,
    notice,
    selectUser,
    sendMessage,
    retryMessage,
    discardMessage,
    deleteMessage,
    loadEarlier,
    sendTyping,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>')
  return ctx
}
