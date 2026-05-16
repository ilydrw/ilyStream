/**
 * Shared animation CSS and logic for ilyStream overlay templates.
 */

export interface AnimationSettings {
  style: 'fade' | 'slide' | 'zoom' | 'bounce' | 'none'
  duration: number
}

export function getAnimationCss(settings: AnimationSettings, selector: string = '.card'): string {
  if (settings.style === 'none') return ''

  const dur = settings.duration / 1000

  let keyframes = ''
  let animationProperty = ''

  switch (settings.style) {
    case 'fade':
      keyframes = `
        @keyframes anim-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `
      animationProperty = `anim-fade-in ${dur}s ease both`
      break
    case 'slide':
      keyframes = `
        @keyframes anim-slide-in {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `
      animationProperty = `anim-slide-in ${dur}s cubic-bezier(0.16, 1, 0.3, 1) both`
      break
    case 'zoom':
      keyframes = `
        @keyframes anim-zoom-in {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
      `
      animationProperty = `anim-zoom-in ${dur}s cubic-bezier(0.34, 1.56, 0.64, 1) both`
      break
    case 'bounce':
      keyframes = `
        @keyframes anim-bounce-in {
          0% { opacity: 0; transform: scale(0.3); }
          50% { opacity: 1; transform: scale(1.05); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); }
        }
      `
      animationProperty = `anim-bounce-in ${dur}s cubic-bezier(0.175, 0.885, 0.32, 1.275) both`
      break
  }

  return `
    ${keyframes}
    ${selector} {
      animation: ${animationProperty};
    }
  `
}
