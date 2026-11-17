import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from './use-session'
import { SipProvider } from '../sip/sip-provider'
import { AppLayout } from '../../components/app-layout'
import { MessageProvider } from '../messages/message-provider'

export default function ProtectedApp() {
  const { session } = useSession()
  const location = useLocation()
  if (!session)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  return (
    <MessageProvider key={session.accessToken}>
      <SipProvider session={session}>
        <AppLayout />
      </SipProvider>
    </MessageProvider>
  )
}
