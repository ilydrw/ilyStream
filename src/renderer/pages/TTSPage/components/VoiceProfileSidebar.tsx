import { Plus } from 'lucide-react'
import { VoiceProfile } from '../../../main/tts/voice-profiles'

interface VoiceProfileSidebarProps {
  profiles: VoiceProfile[]
  selectedProfileId: string
  onSelectProfile: (id: string) => void
  onCreateProfile: () => void
}

export function VoiceProfileSidebar({
  profiles,
  selectedProfileId,
  onSelectProfile,
  onCreateProfile
}: VoiceProfileSidebarProps) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <Plus size={32} />
          </div>
          <div>
            <h2>Voice Profiles</h2>
            <p>Active registry.</p>
          </div>
        </div>
        <button onClick={onCreateProfile} className="app-button !h-10 !w-10 !p-0 hover:border-accent/40" title="Add Profile">
          <Plus size={18} />
        </button>
      </div>
      
      <div className="app-section-content">
        <div className="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto custom-scrollbar">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            onClick={() => onSelectProfile(profile.id)}
            className={`flex items-center gap-4 w-full px-2 py-3 rounded-xl transition-all group ${
              selectedProfileId === profile.id
                ? 'bg-white/[0.05] text-white'
                : 'bg-transparent text-white/20 hover:bg-white/[0.02] hover:text-white/40'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full transition-all ${selectedProfileId === profile.id ? 'bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.6)]' : 'bg-white/10 group-hover:bg-white/20'}`} />
            <div className="flex-1 text-left min-w-0">
              <span className="text-sm font-bold block truncate">{profile.name}</span>
              <span className="text-[9px] font-black uppercase tracking-[0.15em] opacity-20">{profile.provider}</span>
            </div>
            {profile.isDefault && (
              <span className="text-[10px] font-black uppercase tracking-tighter bg-white/10 px-2 py-0.5 rounded-full">Default</span>
            )}
          </button>
        ))}
      </div>
    </div>
  </section>
  )
}
