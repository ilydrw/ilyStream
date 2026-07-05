import { useState } from 'react'
import { IconPlayerPlay, IconRefresh } from '../../components/ui/icons'
import { IconPhoto } from '@tabler/icons-react'
import type { AlertRule } from '../../../shared/alert-rules'
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

function renderTemplate(template: string): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => SAMPLE_VARS[key] ?? `{${key}}`)
}

/**
 * Visual approximation of how the alert will render on the overlay. Renders
 * a frame of the alert at rest using the rule's actual colors / template /
 * layout, plus a "Play" button that re-mounts the alert with a fade-in so
 * the user gets immediate feedback when tweaking settings.
 *
 * Not a perfect-fidelity preview — animations are simplified to a fade-in;
 * actual `animationIn`/`animationOut` (slide, bounce, zoom, tv-warp) still
 * fire on the real overlay. A note under the preview surfaces what's set.
 */
export function AlertLivePreview({ rule, sounds, images }: AlertLivePreviewProps) {
  const [replayKey, setReplayKey] = useState(0)
  const selectedSound = sounds.find(s => s.id === rule.soundId)
  const selectedImage = images.find(i => i.id === rule.imageAssetId)

  const imageSrc = (() => {
    if (!rule.imageEnabled) return null
    if (selectedImage) return `asset://image/${selectedImage.id}`
    return null
  })()
  const text = rule.textEnabled ? renderTemplate(rule.textTemplate || '') : ''
  const showText = rule.textEnabled && text.trim().length > 0
  const showImage = rule.imageEnabled
  const cleanType = getCleanPreviewType(rule)

  const useImageInLayout = showImage && rule.layout !== 'text-only'
  const useTextInLayout = showText && rule.layout !== 'image-only'

  const isSideBySide = rule.layout === 'side-by-side'
  const imageSize = isSideBySide ? 60 : 80

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
        {cleanType ? (
          <CleanPreviewCard
            key={replayKey}
            type={cleanType}
            imageSrc={imageSrc}
            showImage={showImage}
          />
        ) : (
          <div
            key={replayKey}
            className="animate-in fade-in zoom-in-95 duration-300"
            style={{
              maxWidth: 420,
              padding: '14px 18px',
              borderRadius: 12,
              backgroundColor: rule.backgroundColor || 'rgba(0,0,0,0.6)',
              border: rule.borderColor === 'gradient'
                ? '2px solid transparent'
                : `2px solid ${rule.borderColor || 'transparent'}`,
              backgroundImage: rule.borderColor === 'gradient'
                ? `linear-gradient(${rule.backgroundColor || 'rgba(0,0,0,0.6)'}, ${rule.backgroundColor || 'rgba(0,0,0,0.6)'}), linear-gradient(135deg, #19C8FF, #6E80FF)`
                : undefined,
              backgroundOrigin: rule.borderColor === 'gradient' ? 'border-box' : undefined,
              backgroundClip: rule.borderColor === 'gradient' ? 'padding-box, border-box' : undefined,
              display: 'flex',
              flexDirection: isSideBySide ? 'row' : 'column',
              alignItems: 'center',
              gap: 12
            }}
          >
            {useImageInLayout && (
              imageSrc ? (
                <img
                  src={imageSrc}
                  alt=""
                  style={{ width: imageSize, height: imageSize, borderRadius: 999, objectFit: 'cover' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div
                  style={{
                    width: imageSize,
                    height: imageSize,
                    borderRadius: 999,
                    background: 'linear-gradient(135deg, rgba(25,200,255,0.25), rgba(25,200,255,0.06))',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.4)'
                  }}
                  title={rule.useEventImage ? 'Will use the event\'s image at runtime (user avatar, gift icon, etc.)' : 'No image selected'}
                >
                  <IconPhoto size={28} />
                </div>
              )
            )}
            {useTextInLayout && (
              <div
                style={{
                  color: rule.textColor || '#ffffff',
                  fontSize: Math.min(rule.fontSize || 32, 36),
                  fontWeight: rule.fontWeight || 700,
                  textShadow: rule.textShadow || '0 2px 8px rgba(0,0,0,0.5)',
                  textAlign: 'center',
                  lineHeight: 1.15,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  flex: isSideBySide ? '1 1 auto' : undefined
                }}
              >
                {text}
              </div>
            )}
            {!useImageInLayout && !useTextInLayout && (
              <span className="text-[11px] text-white/30">No outputs enabled — alert won't render</span>
            )}
          </div>
        )}
      </div>

    </div>
  )
}

function getCleanPreviewType(rule: AlertRule): 'gift' | 'follow' | null {
  if (rule.id === 'default-gifts') return 'gift'
  if (rule.id === 'default-follows') return 'follow'
  return null
}

function CleanPreviewCard({
  type,
  imageSrc,
  showImage
}: {
  type: 'gift' | 'follow'
  imageSrc: string | null
  showImage: boolean
}) {
  const accent = type === 'gift' ? '#f7c948' : '#38bdf8'
  const eyebrow = type === 'gift' ? 'Gift received' : 'New follower'
  const subtitle = type === 'gift' ? 'sent 5x Rose' : 'started following'

  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-3 duration-300"
      style={{
        width: 'min(520px, 100%)',
        minHeight: 104,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        borderRadius: 22,
        border: `1px solid ${type === 'gift' ? 'rgba(247, 201, 72, 0.26)' : 'rgba(56, 189, 248, 0.24)'}`,
        background: 'linear-gradient(135deg, rgba(18, 22, 30, 0.88), rgba(12, 15, 22, 0.74))',
        boxShadow: '0 22px 70px rgba(0,0,0,0.46), inset 5px 0 0 ' + accent,
        textAlign: 'left'
      }}
    >
      {showImage && (
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.16)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            color: 'rgba(255,255,255,0.92)',
            fontSize: 28,
            fontWeight: 800,
            lineHeight: 1
          }}
        >
          {imageSrc ? (
            <img src={imageSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span>S</span>
          )}
        </div>
      )}
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ color: 'rgba(255,255,255,0.58)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0 }}>
            {eyebrow}
          </span>
          <span style={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.52)', padding: '4px 8px', fontSize: 11, fontWeight: 700 }}>
            TikTok
          </span>
        </div>
        <div style={{ color: '#ffffff', fontSize: 30, fontWeight: 760, lineHeight: 1.04, overflowWrap: 'anywhere', textShadow: '0 8px 26px rgba(0,0,0,0.36)' }}>
          Sample Viewer
        </div>
        <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.70)', fontSize: 16, fontWeight: 560, lineHeight: 1.28, overflowWrap: 'anywhere' }}>
          {subtitle}
        </div>
      </div>
    </div>
  )
}
