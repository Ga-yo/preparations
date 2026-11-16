import { Gothic_A1, IBM_Plex_Sans_KR } from 'next/font/google'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Hero } from './_components/Hero'

// 한글 글리프는 unicode-range로 필요할 때 받으므로 latin만 preload
const gothic = Gothic_A1({ weight: ['500', '700', '900'], subsets: ['latin'], variable: '--font-gothic-a1' })
const plex = IBM_Plex_Sans_KR({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-plex-kr' })

async function start() {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
  }
  const { data, error } = await supabase.from('plans').insert({}).select('id').single()
  if (error) throw error
  redirect(`/plans/${data.id}/stage/1`)
}

export default function Home() {
  return (
    <main className={`${gothic.variable} ${plex.variable} flex flex-1 flex-col`}>
      <Hero start={start} />
    </main>
  )
}
