import { useCallback, useEffect, useRef, useState } from 'react'
import { useChat } from '../context/ChatContext'
import { SendIcon } from './Icons'

const MAX_LENGTH = 2000
const TYPING_IDLE_MS = 1800

export default function MessageInput({ partnerId, partnerName }) {
  const { sendMessage, sendTyping } = useChat()
  const [text, setText] = useState('')
  const areaRef = useRef(null)
  const isTypingRef = useRef(false)
  const idleTimer = useRef(null)

  // Tell the other person "stopped typing" (once).
  const stopTyping = useCallback(() => {
    clearTimeout(idleTimer.current)
    if (isTypingRef.current) {
      isTypingRef.current = false
      sendTyping(partnerId, false)
    }
  }, [partnerId, sendTyping])

  // Leaving this chat (or logging out) while mid-sentence -> stop the indicator.
  useEffect(() => stopTyping, [stopTyping])

  // Focus the box when a chat opens — but not on touch devices (it would pop the keyboard open).
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) areaRef.current?.focus()
  }, [partnerId])

  function resize() {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  function handleChange(e) {
    const value = e.target.value
    setText(value)
    resize()

    if (!value.trim()) return stopTyping()
    if (!isTypingRef.current) {
      isTypingRef.current = true
      sendTyping(partnerId, true)
    }
    // Every keystroke postpones "stopped typing" by a moment.
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS)
  }

  function submit() {
    const clean = text.trim()
    if (!clean) return
    sendMessage(clean)
    setText('')
    stopTyping()
    requestAnimationFrame(resize)
  }

  function handleKeyDown(e) {
    // Enter sends, Shift+Enter inserts a new line. (isComposing: don't send while typing with an IME.)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <textarea
        ref={areaRef}
        className="composer__input"
        rows={1}
        value={text}
        maxLength={MAX_LENGTH}
        placeholder={`Message ${partnerName}`}
        aria-label={`Message ${partnerName}`}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={stopTyping}
      />
      {text.length > 1800 && <span className="composer__count">{text.length}/{MAX_LENGTH}</span>}
      <button className="send-btn" type="submit" disabled={!text.trim()} aria-label="Send message">
        <SendIcon />
      </button>
    </form>
  )
}
