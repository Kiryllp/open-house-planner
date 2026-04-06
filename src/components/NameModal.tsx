'use client'

import { useState, useEffect } from 'react'
import { User } from 'lucide-react'

interface NameModalProps {
  onNameSet: (name: string) => void
}

export function NameModal({ onNameSet }: NameModalProps) {
  const [name, setName] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) {
      localStorage.setItem('userName', trimmed)
      onNameSet(trimmed)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
        <div className="flex items-center mb-4">
          <User className="w-5 h-5 text-gray-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Welcome!</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">Enter your name so others know who you are.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            autoFocus
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full mt-3 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  )
}
