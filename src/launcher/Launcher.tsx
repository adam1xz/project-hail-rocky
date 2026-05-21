import React, { useState } from 'react';
import { Monitor, Smartphone, X } from 'lucide-react';

export function Launcher() {
  const [hovered, setHovered] = useState<'desktop' | 'mobile' | null>(null);
  const [selected, setSelected] = useState<'desktop' | 'mobile' | null>(null);

  function pick(mode: 'desktop' | 'mobile') {
    if (selected) return;
    setSelected(mode);
    window.electronAPI?.selectMode(mode);
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#111113',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Manrope, system-ui, sans-serif',
      color: '#f4eedd',
      WebkitAppRegion: 'drag' as any,
      cursor: 'default',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        top: -60,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 300,
        height: 120,
        background: 'radial-gradient(ellipse, rgba(201,168,76,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <button
        onClick={() => window.electronAPI?.closeApp()}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 28,
          height: 28,
          border: '1px solid #2e2e3c',
          borderRadius: 6,
          background: 'transparent',
          color: '#6e6252',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          WebkitAppRegion: 'no-drag' as any,
          transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.color = '#c94c4c';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#c94c4c';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.color = '#6e6252';
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e3c';
        }}
      >
        <X size={13} />
      </button>

      <div style={{
        fontFamily: 'CindieMono, monospace',
        fontSize: 26,
        letterSpacing: '0.3em',
        color: '#c9a84c',
        marginBottom: 6,
        textShadow: '0 0 24px rgba(201,168,76,0.25)',
      }}>
        ROCKY
      </div>

      <div style={{
        fontSize: 12,
        color: '#6e6252',
        letterSpacing: '0.12em',
        marginBottom: 36,
        textTransform: 'uppercase',
      }}>
        choose your mode
      </div>

      <div style={{
        display: 'flex',
        gap: 16,
        WebkitAppRegion: 'no-drag' as any,
      }}>
        <ModeCard
          icon={<Monitor size={32} strokeWidth={1.5} />}
          title="Desktop"
          description="Rocky on your screen"
          active={hovered === 'desktop' || selected === 'desktop'}
          selected={selected === 'desktop'}
          onClick={() => pick('desktop')}
          onEnter={() => setHovered('desktop')}
          onLeave={() => setHovered(null)}
        />
        <ModeCard
          icon={<Smartphone size={32} strokeWidth={1.5} />}
          title="Mobile"
          description="Connect your phone"
          active={hovered === 'mobile' || selected === 'mobile'}
          selected={selected === 'mobile'}
          onClick={() => pick('mobile')}
          onEnter={() => setHovered('mobile')}
          onLeave={() => setHovered(null)}
        />
      </div>
    </div>
  );
}

interface CardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  active: boolean;
  selected: boolean;
  onClick: () => void;
  onEnter: () => void;
  onLeave: () => void;
}

function ModeCard({ icon, title, description, active, selected, onClick, onEnter, onLeave }: CardProps) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        width: 148,
        height: 148,
        border: `1.5px solid ${active ? '#c9a84c' : '#2e2e3c'}`,
        borderRadius: 14,
        background: active
          ? 'rgba(201,168,76,0.06)'
          : 'rgba(28,28,34,0.6)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        cursor: selected ? 'default' : 'pointer',
        transition: 'border-color 0.18s, background 0.18s, box-shadow 0.18s',
        boxShadow: active
          ? '0 0 24px rgba(201,168,76,0.12), inset 0 0 0 1px rgba(201,168,76,0.05)'
          : 'none',
        transform: selected ? 'scale(0.97)' : active ? 'scale(1.01)' : 'scale(1)',
      }}
    >
      <div style={{
        color: active ? '#c9a84c' : '#6e6252',
        transition: 'color 0.18s',
      }}>
        {icon}
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: active ? '#f4eedd' : '#b8a98a',
          letterSpacing: '0.04em',
          transition: 'color 0.18s',
          marginBottom: 3,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 11,
          color: active ? '#b8a98a' : '#6e6252',
          transition: 'color 0.18s',
          letterSpacing: '0.02em',
        }}>
          {description}
        </div>
      </div>
    </div>
  );
}
