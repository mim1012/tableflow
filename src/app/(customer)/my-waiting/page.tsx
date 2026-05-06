import type { Metadata } from 'next'

import MyWaitingLandingClient from './MyWaitingLandingClient'

export const metadata: Metadata = {
  title: '내 대기 찾기',
}

export default function MyWaitingPage() {
  return <MyWaitingLandingClient />
}
