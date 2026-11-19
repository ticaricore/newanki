import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Icon } from '../icons'
import { Field } from './glass'

/** Errors from TanStack Form field meta, plus server-side field errors. */
export function firstError(errors: unknown[], server?: string): string | undefined {
  const e = errors.find(Boolean)
  if (typeof e === 'string') return e
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return server
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }

export function TextInput({ label, error, id, ...rest }: InputProps) {
  const fid = id ?? `f-${rest.name}`
  return (
    <Field label={label} htmlFor={fid} error={error}>
      <input id={fid} className="na-input" aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  )
}

export function PasswordInput({ label, error, id, ...rest }: InputProps) {
  const [show, setShow] = useState(false)
  const fid = id ?? `f-${rest.name}`
  return (
    <Field label={label} htmlFor={fid} error={error}>
      <div className="relative">
        <input id={fid} type={show ? 'text' : 'password'} className="na-input pr-12" aria-invalid={error ? true : undefined} {...rest} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
          className="absolute top-0 right-0 flex h-full w-12 items-center justify-center border-0 bg-transparent text-na-text-3"
        >
          <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
    </Field>
  )
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }

export function TextArea({ label, error, id, rows = 2, ...rest }: AreaProps) {
  const fid = id ?? `f-${rest.name}`
  return (
    <Field label={label} htmlFor={fid} error={error}>
      <textarea id={fid} rows={rows} className="na-input" aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  )
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-[13px]" style={{ background: 'color-mix(in oklab, var(--na-danger) 14%, transparent)', color: 'var(--na-danger)', border: '0.5px solid color-mix(in oklab, var(--na-danger) 35%, transparent)' }}>
      <Icon name="close" size={14} strokeWidth={2.5} />
      {message}
    </div>
  )
}
