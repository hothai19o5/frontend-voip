import { createContext } from 'react'

export const PresenceContext = createContext<ReadonlySet<string> | null>(null)
