import axios from 'axios'

// Empty string = same origin (Vite proxy in dev, Express in production).
// Set VITE_SERVER_URL only if the backend lives on a different domain.
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

const api = axios.create({
  baseURL: `${SERVER_URL}/api`,
  withCredentials: true, // send the httpOnly login cookie with every request
})

// Turn any axios error into a message that is safe to show to the user.
export function errorMessage(err) {
  return err?.response?.data?.error || (err?.request ? 'Cannot reach the server. Is it running?' : 'Something went wrong')
}

export default api
