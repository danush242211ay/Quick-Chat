import { useAuth } from './context/AuthContext'
import { SocketProvider, useSocket } from './context/SocketContext'
import { ChatProvider, useChat } from './context/ChatContext'
import AuthScreen from './components/AuthScreen'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import { BoltIcon } from './components/Icons'

function ChatApp() {
  const { activeId, notice } = useChat()
  const { connected } = useSocket()

  return (
    <div className={`app ${activeId ? 'app--chat-open' : ''}`}>
      {!connected && <div className="banner" role="status">Connecting to server…</div>}
      <Sidebar />
      <ChatWindow />
      {notice && <div className="toast" role="alert">{notice}</div>}
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="splash" aria-label="Loading"><BoltIcon width={34} height={34} /></div>
  }
  if (!user) return <AuthScreen />

  // The socket + chat state only exist while someone is logged in.
  return (
    <SocketProvider key={user.id}>
      <ChatProvider>
        <ChatApp />
      </ChatProvider>
    </SocketProvider>
  )
}
