const PROXY_URL = 'https://ltgdpbmnvpjwwqkirbxw.supabase.co/functions/v1/claude-proxy'

export async function callClaude(
  messages: { role: string; content: string }[],
  system?: string
): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  const data = await res.json()
  return data.reply
}

// Prefiere el edge function de Supabase (alcanzable también en dev local);
// cae al proxy serverless de Vercel (/api/chat) si el primero falla.
export async function callClaudeProxy(
  messages: { role: string; content: string }[],
  system?: string
): Promise<string> {
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, system }),
    })
    if (res.ok) {
      const data = await res.json()
      return data.reply || data.content?.[0]?.text || ''
    }
  } catch { /* cae al fallback */ }
  return callClaude(messages, system)
}
