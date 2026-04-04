import { test } from '@playwright/test'

// 이 파일은 수동 레코딩/디버깅 전용 스크립트입니다. 자동화 E2E 스위트에서 제외.
test.use({ viewport: { width: 1280, height: 720 } })

test.skip()
test('Owner 로그인 → 테이블 추가 → QR URL로 고객 메뉴 접근', async ({ page }) => {
  // 1. Owner 로그인
  await page.goto('http://localhost:3000/login')
  await page.fill('input[type="email"]', 'owner@flow.com')
  await page.fill('input[type="password"]', 'Test1234!!')
  await page.click('button[type="submit"]')
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 })

  if (page.url().includes('/change-password')) {
    const pwInputs = page.locator('input[type="password"]')
    await pwInputs.nth(0).fill('Test1234!!')
    await pwInputs.nth(1).fill('Test1234!!')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/admin**', { timeout: 15000 })
  }

  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e-recordings/table-01-admin.png' })

  // 2. "매장 관리" 모드로 전환 (사이드바 aside 내부)
  await page.locator('aside button:has-text("매장 관리")').click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'e2e-recordings/table-02-admin-mode.png' })

  // 3. QR 코드 관리 탭 클릭 (사이드바 nav)
  await page.locator('aside button:has-text("QR 코드 관리")').click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e-recordings/table-03-qr-tab.png' })

  // 기존 테이블 수
  const countBefore = await page.locator('h3:has-text("테이블")').count()
  console.log(`=== 기존 테이블: ${countBefore} ===`)

  // 4. 테이블 추가
  await page.locator('button:has-text("테이블 추가")').first().click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e-recordings/table-04-after-add.png' })

  const countAfter = await page.locator('h3:has-text("테이블")').count()
  console.log(`=== 추가 후 테이블: ${countAfter} ===`)

  // 5. DB에서 실제 테이블 qr_token 조회
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: tables } = await supabase
    .from('tables')
    .select('qr_token, table_number')
    .eq('store_id', (await supabase.from('stores').select('id').eq('slug', 'gangnam').single()).data?.id ?? '')
    .order('table_number', { ascending: true })
    .limit(1)

  const qrToken = tables?.[0]?.qr_token ?? 'unknown'
  console.log(`=== QR Token: ${qrToken} ===`)

  // 6. 고객 메뉴 페이지 접근
  const customerUrl = `http://localhost:3000/m/gangnam/${qrToken}`
  console.log(`=== 고객 메뉴: ${customerUrl} ===`)
  await page.goto(customerUrl)
  await page.waitForTimeout(4000)
  await page.screenshot({ path: 'e2e-recordings/table-05-customer-menu.png' })

  console.log('=== 완료: 테이블 추가 + QR 고객 메뉴 접근 성공 ===')
})
