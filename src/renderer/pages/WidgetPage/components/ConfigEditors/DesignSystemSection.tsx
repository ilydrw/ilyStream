import React from 'react'
import { Field, Section } from './Shared'
import { NumberInput, TextInput } from '../../../../components/ui/Inputs'

interface DesignSystemConfig {
  fontFamily: string
  borderRadius: number
  glassIntensity: number
  animationStyle?: string
  animationDuration?: number
}

export function DesignSystemSection({
  config,
  onUpdate
}: {
  config: DesignSystemConfig,
  onUpdate: (key: string, value: any) => void
}) {
  return (
    <Section label="Design System">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Font Family" hint="Google Font name (e.g. Outfit, Inter)">
          <TextInput
            value={config.fontFamily || 'Inter'}
            onChange={(v) => onUpdate('fontFamily', v)}
            placeholder="Outfit"
            className="!h-9 !text-xs"
          />
        </Field>
        <Field label="Corner Radius" hint="Rounded corners (px)">
          <NumberInput
            value={config.borderRadius ?? 12}
            onChange={(v) => onUpdate('borderRadius', v)}
            min={0}
            max={50}
            className="!h-9 !text-xs"
          />
        </Field>
      </div>

      <Field label="Glassmorphism Intensity" hint="Transparency & Blur strength">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={config.glassIntensity ?? 0.5}
            onChange={(e) => onUpdate('glassIntensity', parseFloat(e.target.value))}
            className="flex-1 accent-[#d035f1]"
          />
          <span className="text-[10px] font-mono text-white/50 w-6">
            {Math.round((config.glassIntensity ?? 0.5) * 100)}%
          </span>
        </div>
      </Field>

      {config.animationStyle !== undefined && (
        <>
          <Field label="Entrance Animation">
            <div className="grid grid-cols-5 gap-1.5">
              {['slide', 'fade', 'zoom', 'bounce', 'none'].map((style) => (
                <button
                  key={style}
                  onClick={() => onUpdate('animationStyle', style)}
                  className={`py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all border ${
                    config.animationStyle === style
                      ? 'bg-brand-gradient border-transparent text-white shadow-glow'
                      : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Animation Duration" hint="Time in milliseconds">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="200"
                max="2000"
                step="50"
                value={config.animationDuration ?? 800}
                onChange={(e) => onUpdate('animationDuration', parseInt(e.target.value))}
                className="flex-1 accent-[#d035f1]"
              />
              <span className="text-[10px] font-mono text-white/50 w-10 text-right">
                {config.animationDuration ?? 800}ms
              </span>
            </div>
          </Field>
        </>
      )}
    </Section>
  )
}
