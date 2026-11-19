export interface SipSummary {
  extension: string
  domain: string
  provisioningStatus: 'PROVISIONING' | 'READY' | 'FAILED' | 'UNKNOWN'
  extensionPresent: boolean | null
}

export interface DirectoryUser {
  id: string
  username: string
  displayName: string
  status: 'ACTIVE' | 'BLOCKED'
  sip: SipSummary | null
  online: boolean
}

export interface UserProfile extends Omit<DirectoryUser, 'online'> {
  email: string
  role: 'USER' | 'ADMIN'
  createdAt: string
  phoneNumber: string | null
  phoneCallingEnabled: boolean
}

export interface PresenceSnapshot {
  onlineUserIds: string[]
}

export interface AppSession {
  accessToken: string
  tokenType: 'Bearer'
  expiresAt: string
  user: UserProfile
}

export interface UserPage {
  content: DirectoryUser[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

export interface SipAccount {
  extension: string
  domain: string
  serverIp: string
  wssUrl: string
  password: string
}

export interface RegisterInput {
  username: string
  email: string
  displayName: string
  password: string
  phoneNumber: string
}
