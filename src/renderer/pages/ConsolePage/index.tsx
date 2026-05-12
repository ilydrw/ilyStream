import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '../../stores/ui-store'

export default function ConsolePage() {
  const navigate = useNavigate()
  const { setConsoleOpen } = useUIStore()

  useEffect(() => {
    // Redirect to home but open the console modal
    navigate('/', { replace: true })
    setConsoleOpen(true)
  }, [navigate, setConsoleOpen])

  return null
}
