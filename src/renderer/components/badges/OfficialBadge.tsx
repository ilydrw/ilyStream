import React from 'react';
import type { Platform } from '../../../main/platforms/types';

interface OfficialBadgeProps {
  platform: Platform | 'all';
  role: 'member' | 'superfan' | 'mod';
  size?: number;
}

export function OfficialBadge({ platform, role, size = 16 }: OfficialBadgeProps) {
  if (role === 'mod') {
    // Moderator shields are tinted to the platform — TikTok pink, Twitch purple,
    // etc. — with a white outline and white "M". Falls back to neutral steel.
    const MOD_PALETTE: Record<string, { fill: string; stroke: string }> = {
      tiktok: { fill: '#fe2c55', stroke: '#c4203f' },
      twitch: { fill: '#9146ff', stroke: '#6a2bc2' },
      youtube: { fill: '#ff3b3b', stroke: '#c42b2b' },
      kick: { fill: '#53fc18', stroke: '#3ac00d' }
    };
    const { fill, stroke } = MOD_PALETTE[platform as string] ?? { fill: '#D8DBE0', stroke: '#555B63' };
    return (
      <svg width={size} height={size} viewBox="0 -1.5 24 26" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ overflow: 'visible' }}>
        {/* 1. Shield backdrop (white outline) */}
        <path d="M12 2.8L19 5.4V11.2C19 15.65 16.2 19.25 12 21.2C7.8 19.25 5 15.65 5 11.2V5.4L12 2.8Z" stroke="#ffffff" strokeWidth="4.5" strokeLinejoin="round"/>
        
        {/* 2. Main colored shield */}
        <path d="M12 2.8L19 5.4V11.2C19 15.65 16.2 19.25 12 21.2C7.8 19.25 5 15.65 5 11.2V5.4L12 2.8Z" fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinejoin="round"/>
        
        {/* 3. Main white M text */}
        <text x="12" y="15.8" fontFamily="system-ui, -apple-system, sans-serif" fontSize="11" fontWeight="900" fill="#ffffff" textAnchor="middle">M</text>
      </svg>
    );
  }

  if (platform === 'twitch' && (role === 'member' || role === 'superfan')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="twitchSubStar" x1="6" y1="3" x2="18" y2="21" gradientUnits="userSpaceOnUse">
            <stop stopColor="#C9A7FF"/>
            <stop offset="0.5" stopColor="#8B4DFF"/>
            <stop offset="1" stopColor="#4F1BB8"/>
          </linearGradient>
        </defs>
        <path d="M12 2.5L14.95 8.35L21.45 9.28L16.75 13.82L17.86 20.28L12 17.22L6.14 20.28L7.25 13.82L2.55 9.28L9.05 8.35L12 2.5Z" fill="url(#twitchSubStar)" stroke="#D8C7FF" strokeWidth="1.1" strokeLinejoin="round"/>
        <path d="M12 5.25L13.65 9.45L18.1 10.05L14.9 13.05L15.72 17.48L12 15.34L8.28 17.48L9.1 13.05L5.9 10.05L10.35 9.45L12 5.25Z" fill="#B98CFF" opacity="0.55"/>
        <path d="M8.4 9.2L11.45 4.1" stroke="white" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    );
  }

  if (platform === 'youtube' && role === 'superfan') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 20.1L10.7 18.9C6.1 14.72 3.1 12 3.1 8.65C3.1 5.93 5.22 3.8 7.92 3.8C9.45 3.8 10.9 4.52 11.85 5.65C12.8 4.52 14.25 3.8 15.78 3.8C18.48 3.8 20.6 5.93 20.6 8.65C20.6 12 17.6 14.72 13 18.9L12 20.1Z" fill="#8F111C"/>
        <path d="M7.1 6.4C8.75 5.35 10.35 6.25 10.95 7.25" stroke="white" strokeOpacity="0.72" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M5.9 9.1C5.95 8.45 6.18 7.85 6.55 7.38" stroke="white" strokeOpacity="0.35" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>
    );
  }

  if (platform === 'tiktok' && role === 'member') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 20.1L10.7 18.9C6.1 14.72 3.1 12 3.1 8.65C3.1 5.93 5.22 3.8 7.92 3.8C9.45 3.8 10.9 4.52 11.85 5.65C12.8 4.52 14.25 3.8 15.78 3.8C18.48 3.8 20.6 5.93 20.6 8.65C20.6 12 17.6 14.72 13 18.9L12 20.1Z" fill="#FF6F86"/>
        <path d="M7.1 6.5C8.55 5.55 10.05 6.1 10.9 7.2" stroke="white" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    );
  }

  if (platform === 'tiktok' && role === 'superfan') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 20.1L10.7 18.9C6.1 14.72 3.1 12 3.1 8.65C3.1 5.93 5.22 3.8 7.92 3.8C9.45 3.8 10.9 4.52 11.85 5.65C12.8 4.52 14.25 3.8 15.78 3.8C18.48 3.8 20.6 5.93 20.6 8.65C20.6 12 17.6 14.72 13 18.9L12 20.1Z" fill="#FF8A1F"/>
        <path d="M7.05 6.45C8.7 5.35 10.25 6.16 10.95 7.2" stroke="white" strokeOpacity="0.52" strokeWidth="1.25" strokeLinecap="round"/>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 20.1L10.7 18.9C6.1 14.72 3.1 12 3.1 8.65C3.1 5.93 5.22 3.8 7.92 3.8C9.45 3.8 10.9 4.52 11.85 5.65C12.8 4.52 14.25 3.8 15.78 3.8C18.48 3.8 20.6 5.93 20.6 8.65C20.6 12 17.6 14.72 13 18.9L12 20.1Z" fill="#FF6F86"/>
    </svg>
  );
}
