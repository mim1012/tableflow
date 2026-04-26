import { createClient } from '@/lib/supabase/client'

export interface AlimtalkPayload {
  storeId?: string
  customerId?: string
  to: string
  type: 'POINT_GRANTED' | 'PROMOTION' | 'WAITING_CREATED' | 'WAITING_CALLED'
  customerName?: string
  points?: number
  message?: string
  queueNumber?: number
  storeName?: string
  teamsAhead?: number
  estimatedWaitMinutes?: number
}

export async function sendAlimtalk(payload: AlimtalkPayload): Promise<void> {
  const supabase = createClient()
  const { data, error } = await supabase.functions.invoke('send-alimtalk', { body: payload })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

export async function broadcastPromotion(
  storeId: string,
  customers: { id: string; phone: string | null; name: string }[],
  message: string,
): Promise<{ sent: number; failed: number }> {
  const targets = customers.filter((c) => c.phone?.trim())

  const results = await Promise.allSettled(
    targets.map((customer) =>
      sendAlimtalk({
        storeId,
        customerId: customer.id,
        to: customer.phone!.trim(),
        type: 'PROMOTION',
        customerName: customer.name,
        message,
      }),
    ),
  )

  return results.reduce(
    (acc, result) => {
      if (result.status === 'fulfilled') acc.sent += 1
      else acc.failed += 1
      return acc
    },
    { sent: 0, failed: 0 },
  )
}
