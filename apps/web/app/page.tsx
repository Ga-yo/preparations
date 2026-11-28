import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Hero } from './_components/Hero'
import { HowItWorks } from './_components/HowItWorks'
import { TipPreview } from './_components/TipPreview'
import { ClosingCta } from './_components/ClosingCta'

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
      <HowItWorks />
      <TipPreview />
      <ClosingCta start={start} />
    </main>
  )
}
