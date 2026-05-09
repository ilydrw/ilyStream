import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'

console.log('[Renderer] Starting IlyStream Application...')

const container = document.getElementById('root')

if (container) {
  const root = createRoot(container)
  root.render(
    <HashRouter>
      <App />
    </HashRouter>
  )
} else {
  console.error('Critical Error: Root container #root not found.')
}
