import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import './styles/globals.css'

console.log('[Renderer] Starting ilyStream Application...')

const container = document.getElementById('root')

if (container) {
  const root = createRoot(container)
  const router = createHashRouter([{ path: '*', element: <App /> }])
  root.render(<RouterProvider router={router} />)
} else {
  console.error('Critical Error: Root container #root not found.')
}
