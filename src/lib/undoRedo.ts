'use client'

import { useCallback, useRef, useState } from 'react'

export interface UndoCommand {
  description: string
  undo: () => Promise<void>
  redo: () => Promise<void>
}

export function useUndoRedo(maxHistory = 30) {
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const stackRef = useRef<UndoCommand[]>([])
  const indexRef = useRef(-1)

  function updateFlags() {
    setCanUndo(indexRef.current >= 0)
    setCanRedo(indexRef.current < stackRef.current.length - 1)
  }

  const execute = useCallback((command: UndoCommand) => {
    // Truncate any future commands (we branched)
    stackRef.current = stackRef.current.slice(0, indexRef.current + 1)
    stackRef.current.push(command)
    if (stackRef.current.length > maxHistory) {
      stackRef.current = stackRef.current.slice(-maxHistory)
    }
    indexRef.current = stackRef.current.length - 1
    updateFlags()
  }, [maxHistory])

  const undo = useCallback(async () => {
    if (indexRef.current < 0) return
    const cmd = stackRef.current[indexRef.current]
    indexRef.current--
    updateFlags()
    await cmd.undo()
  }, [])

  const redo = useCallback(async () => {
    if (indexRef.current >= stackRef.current.length - 1) return
    indexRef.current++
    const cmd = stackRef.current[indexRef.current]
    updateFlags()
    await cmd.redo()
  }, [])

  return { execute, undo, redo, canUndo, canRedo }
}
