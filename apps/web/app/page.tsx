import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Hero } from './_components/Hero'

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
    <main className="flex flex-1 flex-col">
      <Hero start={start} />
    </main>
  )
}
