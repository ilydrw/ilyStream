import React from 'react'
import {IconWorld, IconShield, IconActivity, IconShare, IconExternalLink} from '@tabler/icons-react'
import { FacebookIcon } from '../../components/ui/FacebookIcon'

export default function FacebookPage() {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <FacebookIcon size={48} className="text-[#1877F2]" />
            <h1>Facebook Gaming</h1>
          </div>
          <p className="app-page-intro">
            Connect your Facebook Page or Gaming Creator profile. 
            Stream directly to your followers and manage your community interactions.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Metric 
          icon={<IconShield size={20} className="text-white/20" />} 
          label="Account Status" 
          value="Not Linked" 
        />
        <Metric 
          icon={<IconShare size={20} className="text-white/20" />} 
          label="Live Stream" 
          value="Offline" 
        />
        <Metric 
          icon={<IconActivity size={20} className="text-blue-400" />} 
          label="Audience Reach" 
          value="0" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-6">
          <section className="app-section-card glass p-8">
            <div className="app-section-head mb-8">
              <h3 className="text-lg font-bold">Account Connection</h3>
              <p className="text-xs text-white/40">Secure OAuth2 authentication via Facebook.</p>
            </div>
            
            <button className="app-button-primary w-full !h-14 flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest bg-[#1877F2] hover:bg-[#166fe5]">
              <FacebookIcon size={20} />
              Login with Facebook
            </button>
            
            <p className="text-[10px] text-white/20 text-center mt-6 leading-relaxed">
              By connecting, you allow IlyStream to manage your live videos and comments. 
              We never post to your timeline without permission.
            </p>
          </section>
        </div>

        <div className="lg:col-span-6">
          <section className="app-section-card glass p-8 h-full">
            <h3 className="text-sm font-bold mb-4">Stream Settings</h3>
            <div className="space-y-6 opacity-20 pointer-events-none">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Default Privacy</label>
                <div className="app-input">Public</div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Stream Destination</label>
                <div className="app-input">Gaming IconVideo Creator Page</div>
              </div>
            </div>
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
