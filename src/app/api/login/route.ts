import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  const { password } = body

  if (password === process.env.APP_PASSWORD) {
    const cookieStore = await cookies()
    cookieStore.set('auth', 'ok', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
}
