'use client'

import { useState, useEffect } from 'react'
import { NameModal } from './NameModal'
import { MainScreen } from './MainScreen'

export function AppShell() {
  const [userName, setUserName] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('userName')
    if (stored) setUserName(stored)
    setLoaded(true)
  }, [])

  if (!loaded) return null

  if (!userName) {
    return <NameModal onNameSet={setUserName} />
  }

  return <MainScreen userName={userName} onChangeName={setUserName} />
}
