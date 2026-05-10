import type { StudioLayer } from '../../../../shared/studio'
import type { WidgetType } from '../../../../shared/widgets'

export type WidgetStudioPreset = Pick<
  StudioLayer,
  'x' | 'y' | 'width' | 'height' | 'locked' | 'portraitX' | 'portraitY' | 'portraitWidth' | 'portraitHeight' | 'portraitLocked'
> & {
  config?: Record<string, any>
}

const PORTRAIT_STAGE = { width: 1080, height: 1920 }

function centeredBox(stageWidth: number, stageHeight: number, width: number, height: number) {
  return {
    x: Math.round((stageWidth - width) / 2),
    y: Math.round((stageHeight - height) / 2),
    width,
    height
  }
}

function panelBox(
  stageWidth: number,
  stageHeight: number,
  width: number,
  height: number,
  anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'bottom-left',
  inset = 56
) {
  const x = anchor.endsWith('right') ? stageWidth - width - inset : inset
  const y = anchor.startsWith('top') ? inset : stageHeight - height - inset
  return { x, y, width, height }
}

export function resolveWidgetStudioPreset(
  widget?: { type?: WidgetType },
  config: Record<string, any> = {},
  canvasWidth = 1920,
  canvasHeight = 1080
): WidgetStudioPreset {
  const widgetType = widget?.type || config.widgetType || config.type
  const portraitWidth = PORTRAIT_STAGE.width
  const portraitHeight = PORTRAIT_STAGE.height

  if (widgetType === 'screen-border') {
    return {
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      locked: true,
      portraitX: 0,
      portraitY: 0,
      portraitWidth,
      portraitHeight,
      portraitLocked: true,
      config: {
        width: canvasWidth,
        height: canvasHeight,
        aspectRatio: 'auto',
        forceTikTokDimensions: false
      }
    }
  }

  if (
    widgetType === 'particles' ||
    widgetType === 'event-particles' ||
    widgetType === 'falling-roses' ||
    widgetType === 'node-network' ||
    widgetType === 'physics'
  ) {
    return {
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      locked: false,
      portraitX: 0,
      portraitY: 0,
      portraitWidth,
      portraitHeight,
      portraitLocked: false,
      config: {
        width: canvasWidth,
        height: canvasHeight,
        aspectRatio: 'auto',
        forceTikTokDimensions: false
      }
    }
  }

  const panelPresets: Partial<Record<WidgetType, { landscape: ReturnType<typeof panelBox>; portrait: ReturnType<typeof panelBox> }>> = {
    chat: {
      landscape: panelBox(canvasWidth, canvasHeight, 460, 620, 'bottom-right'),
      portrait: panelBox(portraitWidth, portraitHeight, 500, 760, 'bottom-left', 48)
    },
    'chat-unified': {
      landscape: panelBox(canvasWidth, canvasHeight, 460, 680, 'bottom-right'),
      portrait: panelBox(portraitWidth, portraitHeight, 520, 820, 'bottom-left', 48)
    },
    'now-playing': {
      landscape: panelBox(canvasWidth, canvasHeight, 520, 170, 'bottom-left'),
      portrait: panelBox(portraitWidth, portraitHeight, 520, 170, 'bottom-left', 48)
    },
    socials: {
      landscape: panelBox(canvasWidth, canvasHeight, 380, 140, 'top-left'),
      portrait: panelBox(portraitWidth, portraitHeight, 420, 150, 'top-left', 48)
    },
    'follower-goal': {
      landscape: panelBox(canvasWidth, canvasHeight, 420, 130, 'top-right'),
      portrait: panelBox(portraitWidth, portraitHeight, 460, 140, 'top-left', 48)
    },
    goal: {
      landscape: panelBox(canvasWidth, canvasHeight, 420, 130, 'top-right'),
      portrait: panelBox(portraitWidth, portraitHeight, 460, 140, 'top-left', 48)
    },
    'discord-promo': {
      landscape: panelBox(canvasWidth, canvasHeight, 480, 180, 'bottom-left'),
      portrait: panelBox(portraitWidth, portraitHeight, 500, 190, 'bottom-left', 48)
    },
    'latest-gifter': {
      landscape: panelBox(canvasWidth, canvasHeight, 440, 150, 'top-right'),
      portrait: panelBox(portraitWidth, portraitHeight, 500, 160, 'top-left', 48)
    },
    'likes-tracker': {
      landscape: panelBox(canvasWidth, canvasHeight, 420, 220, 'top-right'),
      portrait: panelBox(portraitWidth, portraitHeight, 500, 240, 'top-left', 48)
    },
    leaderboard: {
      landscape: panelBox(canvasWidth, canvasHeight, 430, 520, 'top-right'),
      portrait: panelBox(portraitWidth, portraitHeight, 520, 620, 'top-left', 48)
    },
    alerts: {
      landscape: centeredBox(canvasWidth, canvasHeight, 820, 260),
      portrait: centeredBox(portraitWidth, portraitHeight, 760, 300)
    }
  }

  const panel = panelPresets[widgetType as WidgetType]
  if (panel) {
    return {
      ...panel.landscape,
      locked: false,
      portraitX: panel.portrait.x,
      portraitY: panel.portrait.y,
      portraitWidth: panel.portrait.width,
      portraitHeight: panel.portrait.height,
      portraitLocked: false
    }
  }

  const fallback = centeredBox(canvasWidth, canvasHeight, 600, 400)
  const fallbackPortrait = centeredBox(portraitWidth, portraitHeight, 520, 600)
  return {
    ...fallback,
    locked: false,
    portraitX: fallbackPortrait.x,
    portraitY: fallbackPortrait.y,
    portraitWidth: fallbackPortrait.width,
    portraitHeight: fallbackPortrait.height,
    portraitLocked: false
  }
}
