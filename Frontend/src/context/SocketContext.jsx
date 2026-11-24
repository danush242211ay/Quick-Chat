import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { SERVER_URL } from '../api/client'
import { useAuth } from './AuthContext'

const SocketContext = createContext(null)

// Mounted ONLY while a user is logged in, so the socket's lifetime == the login session:
// log in -> provider mounts -> connect.   log out -> provider unmounts -> disconnect.
export function SocketProvider({ children }) {
  const { expireSession } = useAuth()

  // Create the socket object ONCE. `autoConnect: false` = it doesn't touch the network yet.
  // The browser attaches the httpOnly cookie to the WebSocket handshake automatically.
  const [socket] = useState(() => io(SERVER_URL || undefined, { withCredentials: true, autoConnect: false }))
  const [connected, setConnected] = useState(false)
  const [onlineIds, setOnlineIds] = useState(() => new Set())

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    // The server's auth middleware rejected us (cookie missing / expired).
    const onConnectError = (err) => {
      if (err.message === 'Unauthorized') {
        socket.disconnect()
        expireSession()
      }
    }

    // Full list of who is online, sent once right after we connect.
    const onPresenceList = (ids) => setOnlineIds(new Set(ids))

    // Then incremental changes: someone came online / went offline.
    const onPresenceUpdate = ({ userId, online }) =>
      setOnlineIds((prev) => {
        const next = new Set(prev)
        if (online) next.add(userId)
        else next.delete(userId)
        return next
      })

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('presence:list', onPresenceList)
    socket.on('presence:update', onPresenceUpdate)
    socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('presence:list', onPresenceList)
      socket.off('presence:update', onPresenceUpdate)
      socket.disconnect()
    }
  }, [socket, expireSession])

  const value = useMemo(() => ({ socket, connected, onlineIds }), [socket, connected, onlineIds])
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used inside <SocketProvider>')
  return ctx
}
