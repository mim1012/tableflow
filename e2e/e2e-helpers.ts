import { expect, type Page } from '@playwright/test'

const LOGIN_EMAIL_SELECTOR = '#email'
const LOGIN_PASSWORD_SELECTOR = '#password'
const LOGIN_SUBMIT_SELECTOR = 'button[type="submit"]'

export const SUPERADMIN_EMAIL = process.env.TEST_SUPERADMIN_EMAIL
export const SUPERADMIN_PASSWORD = process.env.TEST_SUPERADMIN_PASSWORD

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`${name} must be set.`)
  }
  return value
}

function getServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
}

export function getServiceRoleHeaders(): Record<string, string> | null {
  const serviceRoleKey = getServiceRoleKey()
  if (!serviceRoleKey) return null
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
  }
}

export async function gotoLogin(page: Page): Promise<void> {
  await page.goto('/login')
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await gotoLogin(page)
  await page.fill(LOGIN_EMAIL_SELECTOR, email)
  await page.fill(LOGIN_PASSWORD_SELECTOR, password)
  await page.click(LOGIN_SUBMIT_SELECTOR)
}

export async function loginAndWaitForAdmin(page: Page, email: string, password: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await login(page, email, password)
    try {
      await expect(page).toHaveURL('/admin', { timeout: 15000 })
      return
    } catch {
      if (attempt === 2) throw new Error(`loginAndWaitForAdmin failed after 3 attempts (still on ${page.url()})`)
      // Rate limiting 대응: 재시도 전 대기
      await page.waitForTimeout(2000)
    }
  }
}

export async function loginAndWaitForPasswordChange(page: Page, email: string, password: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await login(page, email, password)
    try {
      await expect(page).toHaveURL('/change-password', { timeout: 15000 })
      await expect(page.getByRole('heading', { name: '비밀번호 변경' })).toBeVisible({ timeout: 5000 })
      return
    } catch {
      if (attempt === 2) {
        throw new Error(`loginAndWaitForPasswordChange failed after 3 attempts (still on ${page.url()})`)
      }
      await page.waitForTimeout(2000)
    }
  }
}

export async function completePasswordChange(page: Page, newPassword: string): Promise<void> {
  await page.getByPlaceholder('8자 이상, 특수문자 포함').fill(newPassword)
  await page.getByPlaceholder('비밀번호 재입력').fill(newPassword)
  await page.getByRole('button', { name: '비밀번호 변경' }).click()
  await expect(page).toHaveURL('/admin', { timeout: 15000 })
}

export function sidebarBtn(page: Page, matcher: string | RegExp) {
  // Match buttons in both desktop aside and mobile nav/header (responsive layout)
  return page.locator('aside button, nav button, header button').filter({ hasText: matcher })
}

export async function clickSidebarButton(page: Page, matcher: string | RegExp): Promise<void> {
  // Desktop: aside is visible, mobile nav is hidden. Mobile: nav/header is visible, aside is hidden.
  // Iterate to find and click the first visible match.
  const buttons = sidebarBtn(page, matcher)
  await buttons.first().waitFor({ state: 'attached', timeout: 8000 })
  const count = await buttons.count()
  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i)
    if (await btn.isVisible()) {
      await btn.click()
      return
    }
  }
  throw new Error(`사이드바 버튼이 보여야 합니다: ${String(matcher)}`)
}

export async function expectNoSidebarButton(page: Page, matcher: string | RegExp): Promise<void> {
  // Count only visible navigation buttons (ignore hidden responsive counterparts)
  const buttons = sidebarBtn(page, matcher)
  const count = await buttons.count()
  let visibleCount = 0
  for (let i = 0; i < count; i++) {
    if (await buttons.nth(i).isVisible()) visibleCount++
  }
  expect(visibleCount, `사이드바 버튼이 없어야 합니다: ${String(matcher)}`).toBe(0)
}

export async function expectBodyContains(page: Page, text: string): Promise<void> {
  await expect(page.locator('body')).toContainText(text, { timeout: 8000 })
}

export async function expectNotContainsBodyText(page: Page, text: string): Promise<void> {
  await expect(page.locator('body')).not.toContainText(text, { timeout: 5000 })
}

export async function fillDateRange(page: Page, startDate: string, endDate: string): Promise<void> {
  const dateInputs = page.locator('input[type="date"]')
  await dateInputs.nth(0).fill(startDate)
  await dateInputs.nth(1).fill(endDate)
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase env not configured.')
  }

  return { url, anonKey }
}

async function getAccessToken(page: Page): Promise<string | null> {
  // 1. Try cookie-based auth (Supabase SSR / Next.js stores tokens in cookies)
  const cookies = await page.context().cookies()
  const authCookie = cookies.find((c) => c.name.includes('auth-token') && c.name.includes('sb-'))
  if (authCookie) {
    try {
      // Cookie value is base64-encoded JSON with access_token
      const decoded = Buffer.from(authCookie.value.replace(/^base64-/, ''), 'base64').toString('utf8')
      const parsed = JSON.parse(decoded)
      if (parsed?.access_token) return parsed.access_token
    } catch { /* fall through to localStorage */ }
  }

  // 2. Fallback to localStorage (older Supabase client)
  return await page.evaluate(() => {
    const keys = Object.keys(localStorage)
    const sessionKey = keys.find((k) => k.includes('auth-token') || k.includes('supabase'))
    if (!sessionKey) return null

    try {
      const parsed = JSON.parse(localStorage.getItem(sessionKey) ?? '{}')
      return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null
    } catch {
      return null
    }
  })
}

export async function supabaseHeaders(page: Page) {
  const { anonKey } = getSupabaseConfig()
  const token = await getAccessToken(page)
  return {
    Authorization: token ? `Bearer ${token}` : `Bearer ${anonKey}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

export async function supabaseGet<T = unknown>(page: Page, path: string): Promise<T[]> {
  const { url } = getSupabaseConfig()
  const headers = await supabaseHeaders(page)
  const res = await fetch(`${url}/rest/v1/${path}`, { headers })

  expect(res.ok, `Supabase GET failed: ${path} (${res.status} ${res.statusText})`).toBeTruthy()
  return (await res.json()) as T[]
}

export async function supabasePost<T = unknown>(page: Page, path: string, body: object): Promise<T[]> {
  const { url } = getSupabaseConfig()
  const headers = await supabaseHeaders(page)
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  expect(res.ok, `Supabase POST failed: ${path} (${res.status} ${res.statusText})`).toBeTruthy()
  return (await res.json()) as T[]
}

function isTestTagNotSupported(errorText: string) {
  return errorText.includes('test_tag')
}

async function setStoreTestTag(
  headers: Record<string, string>,
  url: string,
  slug: string,
): Promise<void> {
  const res = await fetch(`${url}/rest/v1/stores?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ test_tag: true }),
  })

  if (res.ok) return

  const errorText = await res.text()
  if (isTestTagNotSupported(errorText)) {
    console.warn(`[teardown] test_tag column is not available; skip tagging for slug: ${slug}`)
    return
  }
  throw new Error(`[teardown] Failed to mark test store (${slug}): ${res.status} ${errorText}`)
}

/**
 * Deletes a test store (and all cascaded data) by slug using the service role key.
 */
export async function deleteStoreBySlug(slug: string): Promise<void> {
  const { url } = getSupabaseConfig()
  const headers = getServiceRoleHeaders()
  if (!headers) {
    console.warn(`[teardown] SUPABASE_SERVICE_ROLE_KEY not set — skipping cleanup for store slug: ${slug}`)
    return
  }

  const lookupRes = await fetch(
    `${url}/rest/v1/stores?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { headers },
  )
  if (!lookupRes.ok) {
    const errorText = await lookupRes.text()
    throw new Error(`[teardown] Store lookup failed (${lookupRes.status}) for slug: ${slug} ${errorText}`)
  }
  const rows = (await lookupRes.json()) as Array<{ id: string }>
  if (rows.length === 0) return

  const storeId = rows[0].id
  const delRes = await fetch(`${url}/rest/v1/stores?id=eq.${storeId}`, {
    method: 'DELETE',
    headers,
  })
  if (!delRes.ok) {
    const errorText = await delRes.text()
    throw new Error(`[teardown] Store delete failed (${delRes.status}) for id: ${storeId} ${errorText}`)
  }
}

export async function markStoreTestData(slug: string): Promise<void> {
  const { url } = getSupabaseConfig()
  const headers = getServiceRoleHeaders()
  if (!headers) {
    console.warn(`[teardown] SUPABASE_SERVICE_ROLE_KEY not set — skipping test tag for slug: ${slug}`)
    return
  }
  await setStoreTestTag(headers, url, slug)
}

export async function deleteStoresWithTestTag(): Promise<void> {
  const { url } = getSupabaseConfig()
  const headers = getServiceRoleHeaders()
  if (!headers) {
    console.warn('[teardown] SUPABASE_SERVICE_ROLE_KEY not set — skipping global test tag cleanup.')
    return
  }

  const delRes = await fetch(`${url}/rest/v1/stores?test_tag=eq.true`, {
    method: 'DELETE',
    headers,
  })
  if (delRes.ok) return

  const errorText = await delRes.text()
  if (isTestTagNotSupported(errorText)) {
    console.warn('[teardown] test_tag column is not available. Skip global test cleanup by tag.')
    return
  }
  throw new Error(`[teardown] Failed to delete stores with test_tag=true (${delRes.status}) ${errorText}`)
}
