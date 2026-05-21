import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Wifi, Loader } from 'lucide-react';

interface QrData {
  url: string;
  webUrl: string;
  host: string;
  port: number;
}

export function QrPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<QrData | null>(null);
  const [copied, setCopied] = useState<'app' | 'web' | null>(null);

  useEffect(() => {
    window.electronAPI?.getQrData?.().then((d: QrData | null) => {
      if (d) setData(d);
    });
    // port is known async — update when backend prints it
    window.electronAPI?.onQrData?.((d: QrData) => setData(d));
  }, []);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, data.url, {
      width: 200,
      margin: 1,
      color: {
        dark: '#f4eedd',
        light: '#1c1c22',
      },
    }).catch(() => {});
  }, [data]);

  function copyText(text: string, which: 'app' | 'web') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    });
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
      padding: '24px 20px',
      gap: 0,
    }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Wifi size={15} color="#c9a84c" />
        <span style={{ fontSize: 12, color: '#b8a98a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Mobile Connect
        </span>
      </div>

      <div style={{
        border: '1.5px solid #2e2e3c',
        borderRadius: 16,
        padding: 14,
        background: '#1c1c22',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 228,
        height: 228,
        marginBottom: 20,
        position: 'relative',
      }}>
        {data ? (
          <canvas
            ref={canvasRef}
            style={{ borderRadius: 6 }}
          />
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            color: '#6e6252',
          }}>
            <Loader size={24} style={{ animation: 'spin 1.2s linear infinite' }} />
            <span style={{ fontSize: 12 }}>Starting backend...</span>
          </div>
        )}
      </div>

      {data ? (
        <>
          <p style={{ fontSize: 11, color: '#6e6252', marginBottom: 14, textAlign: 'center', lineHeight: 1.5 }}>
            Scan with the Rocky app — or open the<br />
            web version in any browser on your phone
          </p>

          {/* App URL row */}
          <UrlRow
            label="App link"
            value={data.url}
            onCopy={() => copyText(data.url, 'app')}
            copied={copied === 'app'}
          />

          <div style={{ height: 8 }} />

          {/* Web URL row */}
          <UrlRow
            label="Web link"
            value={data.webUrl}
            onCopy={() => copyText(data.webUrl, 'web')}
            copied={copied === 'web'}
          />
        </>
      ) : (
        <p style={{ fontSize: 12, color: '#6e6252', textAlign: 'center', lineHeight: 1.6 }}>
          Loading models in the background.<br />
          QR code appears once the backend is ready.
        </p>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function UrlRow({ label, value, onCopy, copied }: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div style={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: '#1c1c22',
      border: '1px solid #2e2e3c',
      borderRadius: 8,
      padding: '7px 10px',
    }}>
      <span style={{ fontSize: 10, color: '#6e6252', letterSpacing: '0.08em', textTransform: 'uppercase', minWidth: 42 }}>
        {label}
      </span>
      <span style={{
        fontSize: 11,
        color: '#b8a98a',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontFamily: 'CindieMono, monospace',
      }}>
        {value}
      </span>
      <button
        onClick={onCopy}
        style={{
          border: 'none',
          background: 'transparent',
          color: copied ? '#4caa6e' : '#6e6252',
          cursor: 'pointer',
          padding: '2px 4px',
          display: 'flex',
          transition: 'color 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => { if (!copied) (e.currentTarget as HTMLButtonElement).style.color = '#c9a84c'; }}
        onMouseLeave={e => { if (!copied) (e.currentTarget as HTMLButtonElement).style.color = '#6e6252'; }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}
