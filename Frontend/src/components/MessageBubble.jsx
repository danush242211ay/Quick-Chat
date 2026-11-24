import { formatTime } from '../lib/format'
import { ClockIcon, TickIcon, TrashIcon } from './Icons'

function Status({ status }) {
  if (status === 'sending') return <ClockIcon className="tick tick--sending" aria-label="Sending" />
  const double = status === 'delivered' || status === 'read'
  return <TickIcon double={double} className={`tick tick--${status}`} aria-label={status} />
}

export default function MessageBubble({ message, mine, groupStart, onDelete, onRetry, onDiscard }) {
  const failed = message.status === 'failed'

  return (
    <div className={`bubble-row ${mine ? 'bubble-row--mine' : ''} ${groupStart ? 'bubble-row--start' : ''}`}>
      {mine && !message.deleted && !failed && message.status !== 'sending' && (
        <button className="bubble-action" onClick={() => onDelete(message._id)} title="Delete for everyone" aria-label="Delete message">
          <TrashIcon />
        </button>
      )}

      <div className={`bubble ${mine ? 'bubble--mine' : ''} ${message.deleted ? 'bubble--deleted' : ''} ${failed ? 'bubble--failed' : ''}`}>
        {message.deleted ? <span>🚫 This message was deleted</span> : <span className="bubble__text">{message.text}</span>}
        <span className="bubble__meta">
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {mine && !message.deleted && !failed && <Status status={message.status} />}
        </span>
      </div>

      {failed && (
        <span className="bubble-failed">
          Not sent ·{' '}
          <button className="link" onClick={() => onRetry(message.tempId)}>Retry</button> ·{' '}
          <button className="link" onClick={() => onDiscard(message.tempId)}>Remove</button>
        </span>
      )}
    </div>
  )
}
