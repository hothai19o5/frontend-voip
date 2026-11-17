import type { InputHTMLAttributes, ReactNode } from 'react'
import { AudioLines, AlertCircle, LoaderCircle } from 'lucide-react'
import { Input } from './ui/input'
import { APP_NAME } from '../lib/brand'

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'brand-small' : ''}`}>
      <span className="brand-mark">
        <AudioLines aria-hidden="true" />
      </span>
      <span>{APP_NAME}</span>
    </div>
  )
}

export function PersonAvatar({
  name,
  large = false,
}: {
  name: string
  large?: boolean
}) {
  const hash = [...name].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  )
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={`person-avatar avatar-color-${hash % 5} ${large ? 'avatar-large' : ''}`}
    >
      {initials}
    </span>
  )
}

export function Field({
  label,
  error,
  icon,
  trailing,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  icon?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{label}</label>
      <div className={`input-wrap ${icon ? 'with-icon' : ''}`}>
        {icon}
        <Input
          {...props}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${props.id}-error` : props['aria-describedby']
          }
        />
        {trailing}
      </div>
      {error ? (
        <p className="field-error" id={`${props.id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function Notice({
  children,
  tone = 'error',
}: {
  children: ReactNode
  tone?: 'error' | 'info' | 'success'
}) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <AlertCircle size={17} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  )
}

export function StatusPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'blue' | 'orange' | 'red'
}) {
  return (
    <span className={`status-pill status-${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  )
}
