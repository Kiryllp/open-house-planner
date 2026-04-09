'use client'

import { useState } from 'react'
import { NameModal } from './NameModal'
import { MainScreen } from './MainScreen'

export function AppShell() {
  const [userName, setUserName] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem('userName')?.trim()
    return stored || null
  })

  if (!userName) {
    return <NameModal onNameSet={setUserName} />
  }

  return <MainScreen userName={userName} onChangeName={setUserName} />
}
