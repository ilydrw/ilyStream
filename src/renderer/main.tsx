import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'

console.log('[Renderer] Starting IlyStream Application...')

const container = document.getElementById('root')

if (container) {
  const root = createRoot(container)
  root.render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
} else {
  console.error('Critical Error: Root container #root not found.')
}
