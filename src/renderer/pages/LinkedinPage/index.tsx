import React from 'react'
import { Globe, Shield, Activity, Users, ExternalLink } from 'lucide-react'
import { LinkedinIcon } from '../../components/ui/LinkedinIcon'

export default function LinkedinPage() {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div>
          <div className="app-header-eyebrow">
            <Globe size={14} className="text-accent" />
            <span>Platform Integration</span>
          </div>
          <div className="flex items-center gap-4 mb-2">
            <LinkedinIcon size={48} className="text-[#0A66C2]" />
            <h1>LinkedIn Live</h1>
          </div>
          <p className="app-page-intro">
            Professional broadcasting. Stream your workshops, coding sessions, and interviews directly to your professional network.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Metric 
          icon={<Shield size={20} className="text-white/20" />} 
          label="Account Status" 
          value="Not Linked" 
        />
        <Metric 
          icon={<Users size={20} className="text-white/20" />} 
          label="Connections" 
          value="0" 
        />
        <Metric 
          icon={<Activity size={20} className="text-blue-600" />} 
          label="Engagement" 
          value="0%" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-12">
          <section className="app-section-card glass p-12 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#0A66C2]/10 flex items-center justify-center text-[#0A66C2] mb-8">
              <LinkedinIcon size={48} />
            </div>
            <h2 className="text-2xl font-bold mb-4">Professional Broadcasting</h2>
            <p className="text-white/40 max-w-lg mb-10 leading-relaxed">
              To stream to LinkedIn, you must have a LinkedIn Live authorized profile or page. 
              Grant IlyStream the necessary permissions to start your broadcast.
            </p>
            <button className="app-button-primary !h-14 px-10 bg-[#0A66C2] hover:bg-[#084d91] text-xs font-black uppercase tracking-widest">
              Authorize LinkedIn Account
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="app-section-card glass !p-10 flex flex-col items-center justify-center text-center gap-4">
      <div className="mb-2 transform group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-white/30 mb-2">{label}</p>
        <p className="text-4xl font-bold font-mono text-white">{value}</p>
      </div>
    </div>
  )
}
