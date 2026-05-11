import React from 'react'
import { Toggle } from '../../../components/ui/Inputs'
import { AppSettings, AutomationKeystrokeMapping } from '../../../../shared/app-settings'
import { SettingRow, TextInput } from './SettingsShared'
import {IconTrash, IconPlus, IconKeyboard} from '@tabler/icons-react'

interface AutomationSectionProps {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function AutomationSection({ settings, onUpdate }: AutomationSectionProps) {
  const mappings = settings?.automationKeystrokeMapping || []

  const addMapping = () => {
    const newMapping: AutomationKeystrokeMapping = {
      id: Math.random().toString(36).substring(2, 11),
      type: 'chat-command',
      trigger: '!jump',
      key: 'space',
      modifiers: [],
      enabled: true
    }
    onUpdate('automationKeystrokeMapping', [...mappings, newMapping])
  }

  const removeMapping = (id: string) => {
    onUpdate('automationKeystrokeMapping', mappings.filter(m => m.id !== id))
  }

  const updateMapping = (id: string, updates: Partial<AutomationKeystrokeMapping>) => {
    onUpdate('automationKeystrokeMapping', mappings.map(m => 
      m.id === id ? { ...m, ...updates } : m
    ))
  }

  return (
    <section className="app-section-card glass relative overflow-hidden">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconKeyboard size={32} />
          </div>
          <div>
            <h2>System Automation</h2>
            <p>Execute global keystrokes.</p>
          </div>
        </div>
        <Toggle 
          value={!!settings?.automationEnabled} 
          onChange={(v) => onUpdate('automationEnabled', v)} 
        />
      </div>

      <div className="app-section-content !p-0">
        <div className="flex flex-col gap-6 p-8">
          <div className="space-y-4">
            {mappings.map((mapping) => (
              <div key={mapping.id || Math.random().toString()} className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 flex items-center gap-6">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div>
                    <label className="text-[10px] uppercase font-black text-white/20 block mb-2 tracking-[0.2em]">Trigger</label>
                    <TextInput 
                      value={mapping.trigger || ''} 
                      onChange={(v) => updateMapping(mapping.id, { trigger: v })}
                      placeholder="!jump or Rose"
                      className="!w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-black text-white/20 block mb-2 tracking-[0.2em]">Key</label>
                    <TextInput 
                      value={mapping.key || ''} 
                      onChange={(v) => updateMapping(mapping.id, { key: v })}
                      placeholder="space, f1, etc"
                      className="!w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-black text-white/20 block mb-2 tracking-[0.2em]">Type</label>
                    <select 
                      value={mapping.type || 'chat-command'}
                      onChange={(e) => updateMapping(mapping.id, { type: e.target.value as any })}
                      className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-4 text-sm font-medium focus:outline-none focus:border-accent transition-all hover:bg-black/60"
                    >
                      <option value="chat-command">Chat Command</option>
                      <option value="gift">Gift Name</option>
                    </select>
                  </div>
                </div>

                <button 
                  onClick={() => removeMapping(mapping.id)}
                  className="w-12 h-12 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors bg-white/5 rounded-2xl hover:bg-red-400/10"
                >
                  <IconTrash size={18} />
                </button>
              </div>
            ))}

            {mappings.length === 0 && (
              <div className="text-center py-16 border-2 border-dashed border-white/5 rounded-[32px] bg-white/[0.01]">
                <IconKeyboard size={48} className="mx-auto text-white/5 mb-4" />
                <p className="text-sm text-white/20 font-black uppercase tracking-widest">No automation mappings</p>
                <p className="text-[10px] text-white/10 uppercase tracking-[0.2em] mt-2">Add a command to start controlling your PC</p>
              </div>
            )}

            <button 
              onClick={addMapping}
              className="w-full h-20 border-2 border-dashed border-white/5 hover:border-accent/30 hover:bg-accent/5 rounded-[32px] flex items-center justify-center gap-4 text-xs font-black uppercase tracking-[0.2em] text-white/20 hover:text-accent transition-all group mt-2"
            >
              <IconPlus size={24} className="group-hover:rotate-90 transition-transform" />
              Add New Key Mapping
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
