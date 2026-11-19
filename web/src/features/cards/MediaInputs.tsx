import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { useUploadMedia } from '@/api/queries'
import { Icon } from '@/components/icons'
import { Button, Spinner, Waveform } from '@/components/ui/glass'
import { mediaURL } from '@/features/study/CardFaces'
import { duration as fmtDuration } from '@/lib/format'

/** Image picker: camera or gallery, uploads immediately and reports the media uid. */
export function ImagePicker({ value, onChange }: { value?: string; onChange: (uid: string | undefined) => void }) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const upload = useUploadMedia()

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const m = await upload.mutateAsync(f).catch(() => null)
    if (m) onChange(m.uid)
  }
  const inputProps = { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', className: 'hidden', onChange: (e: React.ChangeEvent<HTMLInputElement>) => { void onFile(e.target.files?.[0]); e.target.value = '' } } as const

  return (
    <div>
      <input ref={camera} capture="environment" {...inputProps} />
      <input ref={gallery} {...inputProps} />
      {value ? (
        <div className="na-glass relative overflow-hidden" style={{ borderRadius: 16 }}>
          <img src={mediaURL(value)} alt="Kart görseli" className="block max-h-72 w-full object-contain" style={{ background: 'linear-gradient(135deg, #1E293B, #334155)' }} />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <Button size="sm" icon="refresh" onClick={() => gallery.current?.click()}>Değiştir</Button>
            <Button size="sm" iconOnly icon="trash" aria-label="Görseli kaldır" onClick={() => onChange(undefined)} style={{ width: 36 }} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-4 py-5 text-na-text-2" style={{ borderRadius: 16, border: '1px dashed var(--na-glass-border-strong)' }}>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'rgba(244,114,182,0.16)', color: '#F472B6' }}>
            {upload.isPending ? <Spinner /> : <Icon name="camera" size={20} />}
          </div>
          <div className="text-[13px] font-semibold">Fotoğraf çek veya galeriden seç</div>
          <div className="flex gap-2">
            <Button size="sm" icon="camera" onClick={() => camera.current?.click()} disabled={upload.isPending}>Kamera</Button>
            <Button size="sm" icon="image" onClick={() => gallery.current?.click()} disabled={upload.isPending}>Galeri</Button>
          </div>
          <div className="text-[11px] text-na-text-3">PNG, JPG, WEBP · en fazla 5 MB</div>
        </div>
      )}
      {upload.error ? <div role="alert" className="mt-1.5 text-xs text-na-danger">{upload.error instanceof ApiError ? upload.error.message : 'Yükleme başarısız'}</div> : null}
    </div>
  )
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m))
}

/** Microphone recorder (MediaRecorder) with file-upload fallback. */
export function AudioRecorder({ value, onChange }: { value?: string; onChange: (uid: string | undefined, seconds?: number) => void }) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const started = useRef(0)
  const file = useRef<HTMLInputElement>(null)
  const upload = useUploadMedia()
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!pickMime()

  useEffect(() => {
    if (!recording) return
    const t = window.setInterval(() => setElapsed(Date.now() - started.current), 200)
    return () => window.clearInterval(t)
  }, [recording])
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), [])

  const start = async () => {
    setMicError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = pickMime()
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const secs = (Date.now() - started.current) / 1000
        const blob = new Blob(chunks.current, { type: (r.mimeType || mime || 'audio/webm').split(';')[0] })
        const m = await upload.mutateAsync(blob).catch(() => null)
        if (m) onChange(m.uid, Math.round(secs * 10) / 10)
      }
      rec.current = r
      started.current = Date.now()
      setElapsed(0)
      r.start()
      setRecording(true)
    } catch {
      setMicError('Mikrofona erişilemedi. Tarayıcı izinlerini kontrol edin veya dosya yükleyin.')
    }
  }
  const stop = () => {
    rec.current?.stop()
    setRecording(false)
  }

  return (
    <div>
      <input ref={file} type="file" accept="audio/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        const m = await upload.mutateAsync(f).catch(() => null)
        if (m) onChange(m.uid)
      }} />
      <div className="na-glass flex items-center gap-3 p-3.5" style={{ borderRadius: 14 }}>
        <button
          type="button"
          disabled={!supported || upload.isPending}
          onClick={recording ? stop : start}
          aria-label={recording ? 'Kaydı durdur' : 'Kayda başla'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 text-white"
          style={{ background: 'linear-gradient(180deg, #FB7185, #DC2626)', boxShadow: recording ? '0 0 0 6px rgba(251,113,133,0.25), 0 6px 16px rgba(220,38,38,0.4)' : '0 1px 0 rgba(255,255,255,0.3) inset, 0 6px 16px rgba(220,38,38,0.4)' }}
        >
          {upload.isPending ? <Spinner size={14} /> : <Icon name={recording ? 'pause' : 'mic'} size={18} strokeWidth={2.5} />}
        </button>
        <div className="min-w-0 flex-1">
          {value && !recording ? (
            <audio src={mediaURL(value)} controls className="h-9 w-full" />
          ) : (
            <div className="text-na-purple"><Waveform bars={28} height={26} progress={recording ? 1 : 0} dim={0.25} /></div>
          )}
        </div>
        <span className="na-mono text-[11px] text-na-text-3">{fmtDuration(elapsed)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" icon="upload" onClick={() => file.current?.click()} disabled={recording || upload.isPending}>Dosya yükle</Button>
        {value ? <Button size="sm" variant="ghost" icon="trash" onClick={() => onChange(undefined)}>Kaldır</Button> : null}
      </div>
      {micError || upload.error ? (
        <div role="alert" className="mt-1.5 text-xs text-na-danger">{micError ?? (upload.error instanceof ApiError ? upload.error.message : 'Yükleme başarısız')}</div>
      ) : null}
    </div>
  )
}
