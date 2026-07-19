import { useState } from 'react'
import { IconPlayerPlay, IconRefresh } from '../../components/ui/icons'
import type { AlertRule } from '../../../shared/alert-rules'
import { composeAlertBackground } from '../../../shared/alert-rules'
import type { SoundFile } from '../../hooks/useSoundboard'
import type { AssetFile } from '../../hooks/useAssets'

interface AlertLivePreviewProps {
  rule: AlertRule
  sounds: SoundFile[]
  images: AssetFile[]
}

const SAMPLE_VARS: Record<string, string> = {
  displayName: 'Sample Viewer',
  user: 'Sample Viewer',
  username: 'sample_viewer',
  nickname: 'Sample Viewer',
  giftName: 'Rose',
  giftCount: '5',
  amount: '5.00',
  platform: 'tiktok',
  eventType: 'gift',
  message: 'Hello from preview!',
  viewerCount: '1,234',
  likeCount: '10',
  totalLikes: '5,678',
  tier: 'Superfan',
  months: '3',
  gifterName: ''
}

/**
 * Stand-in for the viewer avatar / gift icon the overlay resolves at runtime
 * when "Use the event's image" is on and no asset is picked. Inline SVG so
 * the preview never depends on the network.
 */
const SAMPLE_EVENT_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#19C8FF"/><stop offset="1" stop-color="#6E80FF"/>' +
  '</linearGradient></defs>' +
  '<rect width="160" height="160" rx="80" fill="url(#g)"/>' +
  '<text x="80" y="103" font-family="Inter,Segoe UI,Arial" font-size="64" font-weight="800" fill="rgba(10,14,24,0.62)" text-anchor="middle">S</text>' +
  '</svg>'
)

function renderTemplate(template: string): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => SAMPLE_VARS[key] ?? `{${key}}`)
}

/**
 * Visual approximation of how the alert will render on the overlay, built
 * from the rule's actual style fields (background + opacity, border, radius,
 * padding, image placement/size, text alignment). A "Play" button re-mounts
 * the card with a fade-in for quick feedback while tweaking.
 *
 * Not a perfect-fidelity preview — animations are simplified to a fade-in;
 * actual `animationIn`/`animationOut` (slide, bounce, zoom, tv-warp) still
 * fire on the real overlay.
 */
export function AlertLivePreview({ rule, sounds, images }: AlertLivePreviewProps) {
  const [replayKey, setReplayKey] = useState(0)
  const selectedSound = sounds.find(s => s.id === rule.soundId)
  const selectedImage = images.find(i => i.id === rule.imageAssetId)

  // Same scheme + path the asset library thumbnails use. When no asset is
  // picked but the rule uses the event's own image, show the sample avatar
  // so the preview mirrors what the overlay does at runtime.
  const imageSrc = (() => {
    if (!rule.imageEnabled) return null
    if (selectedImage) return `asset:///app/${encodeURIComponent(selectedImage.id)}`
    if (rule.useEventImage) return SAMPLE_EVENT_IMAGE
    return null
  })()
  const text = rule.textEnabled ? renderTemplate(rule.textTemplate || '') : ''
  const showText = rule.textEnabled && text.trim().length > 0
  const showImage = rule.imageEnabled

  const useImageInLayout = showImage && rule.layout !== 'text-only'
  const useTextInLayout = showText && rule.layout !== 'image-only'

  const isSideBySide = rule.layout === 'side-by-side'
  // The preview renders at roughly 0.4× overlay scale.
  const PREVIEW_SCALE = 0.4
  // Overlay defaults: 200px stacked / 120px side-by-side.
  const imageSize = (rule.imageSize ?? 0) > 0
    ? Math.max(24, Math.min(160, Math.round(rule.imageSize * PREVIEW_SCALE)))
    : (isSideBySide ? 48 : 80)

  const composedBg = composeAlertBackground(rule.backgroundColor, rule.backgroundOpacity ?? -1)
  // Fallback mirrors the overlay's widget-level default glass tint.
  const previewBg = composedBg.css || rule.backgroundColor || 'rgba(10, 12, 18, 0.4)'
  const previewBorderWidth = Math.min(12, Math.max(0, rule.borderWidth ?? 1))
  const previewRadius = (rule.borderRadius ?? -1) >= 0 ? Math.min(60, rule.borderRadius) : 16
  const placement = rule.imagePlacement && rule.imagePlacement !== 'auto'
    ? rule.imagePlacement
    : (isSideBySide ? 'left' : 'top')
  const effectiveRow = placement === 'left' || placement === 'right'
  const previewTextAlign = rule.textAlign && rule.textAlign !== 'auto'
    ? rule.textAlign
    : (effectiveRow ? 'left' : 'center')
  const hasCustomPadding = (rule.paddingX ?? -1) >= 0 || (rule.paddingY ?? -1) >= 0
  const previewPadding = hasCustomPadding
    ? `${Math.round(Math.max(0, rule.paddingY ?? 35) * PREVIEW_SCALE)}px ${Math.round(Math.max(0, rule.paddingX ?? 50) * PREVIEW_SCALE)}px`
    : '14px 18px'

  // Offsets are overlay pixels too — scale them the same way so nudging the
  // image in the editor moves the preview proportionally.
  const imageOffsetX = Math.round((rule.imageLeft ?? 0) * PREVIEW_SCALE)
  const imageOffsetY = Math.round((rule.imageTop ?? 0) * PREVIEW_SCALE)

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(25,200,255,0.6)]" />
          <span className="text-[12px] font-semibold text-white/75">Live preview</span>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-white/55">
          {selectedSound && (
            <span className="truncate max-w-[200px]" title={selectedSound.name}>♪ {selectedSound.name}</span>
          )}
          <button
            onClick={() => setReplayKey(k => k + 1)}
            className="app-button !h-9 !px-3.5 !text-[12px]"
            title="Replay preview"
          >
            {replayKey === 0 ? <IconPlayerPlay size={13} /> : <IconRefresh size={13} />}
            Play
          </button>
        </div>
      </div>

      <div
        className="relative flex items-center justify-center px-6 py-12"
        style={{
          minHeight: 240,
          background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0 8px, transparent 8px 16px)'
        }}
      >
        <div
          key={replayKey}
          className="animate-in fade-in zoom-in-95 duration-300"
          style={{
            position: 'relative',
            maxWidth: 420,
            padding: previewPadding,
            borderRadius: previewRadius,
            backgroundColor: previewBg,
            border: rule.borderColor === 'gradient'
              ? undefined
              : `${previewBorderWidth}px solid ${rule.borderColor || 'transparent'}`,
            display: 'flex',
            flexDirection: placement === 'left' ? 'row' : placement === 'right' ? 'row-reverse' : placement === 'bottom' ? 'column-reverse' : 'column',
            alignItems: 'center',
            gap: 12
          }}
        >
          {rule.borderColor === 'gradient' && (
            // Ring-only gradient edge via mask compositing — the same approach
            // as the overlay's cyber border. The old two-layer background
            // trick painted the gradient across the whole card whenever the
            // background was semi-transparent.
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: previewRadius,
                padding: Math.max(2, previewBorderWidth),
                background: 'linear-gradient(135deg, #19C8FF, #6E80FF)',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                pointerEvents: 'none'
              }}
            />
          )}
          {useImageInLayout && imageSrc && (
            <img
              src={imageSrc}
              alt=""
              style={{
                width: imageSize,
                height: imageSize,
                objectFit: 'contain',
                transform: (imageOffsetX || imageOffsetY) ? `translate(${imageOffsetX}px, ${imageOffsetY}px)` : undefined,
                filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.5))',
                flexShrink: 0
              }}
              onError={(e) => { (e.target as HTMLImageElement).src = SAMPLE_EVENT_IMAGE }}
            />
          )}
          {useTextInLayout && (
            <div
              style={{
                color: rule.textColor || '#ffffff',
                fontSize: Math.min(rule.fontSize || 32, 36),
                fontWeight: rule.fontWeight || 700,
                textShadow: rule.textShadow || '0 2px 8px rgba(0,0,0,0.5)',
                textAlign: previewTextAlign,
                lineHeight: 1.15,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                flex: effectiveRow ? '1 1 auto' : undefined
              }}
            >
              {text}
            </div>
          )}
          {!useImageInLayout && !useTextInLayout && (
            <span className="text-[11px] text-white/30">No outputs enabled — alert won't render</span>
          )}
        </div>
      </div>

    </div>
  )
}
