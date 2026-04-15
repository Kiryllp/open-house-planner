'use client'

import { useEffect } from 'react'

interface Props {
  floorplanUrl: string
}

/**
 * Waits for the floorplan background image to fully load, then fires
 * window.print(). Also wires up the toolbar "Print" button via event
 * delegation so the server component can stay zero-JS.
 */
export function PrintAutoTrigger({ floorplanUrl }: Props) {
  useEffect(() => {
    let cancelled = false

    // Wire the toolbar print button
    const btn = document.querySelector<HTMLButtonElement>('.print-toolbar button')
    const onBtnClick = () => window.print()
    btn?.addEventListener('click', onBtnClick)

    function triggerOnce() {
      if (cancelled) return
      // Give the browser one frame to finish paint before opening the
      // native print dialog — otherwise the dialog can preview a blank
      // page in Chromium.
      requestAnimationFrame(() => {
        if (cancelled) return
        window.print()
      })
    }

    if (!floorplanUrl) {
      triggerOnce()
    } else {
      const img = new Image()
      img.onload = triggerOnce
      img.onerror = triggerOnce
      img.src = floorplanUrl
      if (img.complete) triggerOnce()
    }

    return () => {
      cancelled = true
      btn?.removeEventListener('click', onBtnClick)
    }
  }, [floorplanUrl])

  return null
}
