import { useCallback, useLayoutEffect, useMemo, useState } from 'react'

import type { WidgetPreviewFrame } from '../widget-customization'

export function usePreviewViewportScale(frame: Pick<WidgetPreviewFrame, 'width' | 'height'>) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(node)
  }, [])

  useLayoutEffect(() => {
    if (!container) return

    const updateScale = () => {
      const rect = container.getBoundingClientRect()
      if (!rect.width || !rect.height || !frame.width || !frame.height) return

      const nextScale = Math.max(0.01, Math.min(rect.width / frame.width, rect.height / frame.height))
      setScale((current) => (Math.abs(current - nextScale) < 0.001 ? current : nextScale))
    }

    updateScale()

    const observer = new ResizeObserver(updateScale)
    observer.observe(container)
    window.addEventListener('resize', updateScale)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScale)
    }
  }, [container, frame.height, frame.width])

  const viewportStyle = useMemo(
    () => ({
      width: `${frame.width}px`,
      height: `${frame.height}px`,
      transform: `scale(${scale})`,
      transformOrigin: 'top left'
    }),
    [frame.height, frame.width, scale]
  )

  return {
    containerRef,
    scale,
    viewportStyle
  }
}
