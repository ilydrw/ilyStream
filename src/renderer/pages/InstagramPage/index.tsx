import React from 'react'
import {IconWorld, IconBrandInstagram as Insta, IconActivity, IconHeart, IconCamera} from '@tabler/icons-react'
import { InstagramIcon } from '../../components/ui/InstagramIcon'

export default function InstagramPage() {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <InstagramIcon size={48} className="text-pink-500" />
            <h1>Instagram Live</h1>
          </div>
          <p className="app-page-intro">
            Reach your mobile audience. Broadcast vertically and interact with your Instagram followers in real-time.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Metric 
          icon={<Insta size={20} className="text-white/20" />} 
          label="Profile Link" 
          value="Disconnected" 
        />
        <Metric 
          icon={<IconHeart size={20} className="text-pink-400" />} 
          label="Live Likes" 
          value="0" 
        />
        <Metric 
          icon={<IconActivity size={20} className="text-orange-400" />} 
          label="Active Viewers" 
          value="0" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-12">
          <section className="app-section-card glass p-12 flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-1 mb-8">
              <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                <IconCamera size={40} className="text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-4">Ready to go Live?</h2>
            <p className="text-white/40 max-w-md mb-10">
              Instagram Live requires a Professional or Creator account. 
              Once linked, you can stream directly from IlyStream using your dedicated Stream Key.
            </p>
            <button className="px-12 py-4 rounded-2xl bg-gradient-to-r from-pink-600 to-orange-600 text-white font-black text-xs uppercase tracking-widest hover:scale-[1.05] transition-transform">
              Connect Instagram Account
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
