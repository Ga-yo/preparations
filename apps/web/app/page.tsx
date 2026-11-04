import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
    <main className="flex flex-1 flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-semibold">내 집 마련 AI 에이전트</h1>
      <form action={start}>
        <button type="submit" className="rounded-full bg-foreground px-6 py-3 text-background">
          시작하기
        </button>
      </form>
    </main>
  )
}
