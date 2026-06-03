import { describe, expect, it } from 'vitest'

import { formatAlimtalkProviderError } from './alimtalkProviderError'

describe('formatAlimtalkProviderError', () => {
  it('includes HTTP status and provider fields when Solapi returns structured errors', () => {
    expect(formatAlimtalkProviderError(400, {
      code: 'ValidationFailed',
      message: 'Invalid template variables',
      details: 'missing #{매장명}',
      errors: [
        { code: 'KAKAO_TEMPLATE', message: 'template mismatch' },
      ],
    })).toBe(
      '알림톡 발송 실패 [status=400, code=ValidationFailed, message=Invalid template variables, details=missing #{매장명}, errors[0]=KAKAO_TEMPLATE: template mismatch]',
    )
  })

  it('falls back safely when provider payload is not an object', () => {
    expect(formatAlimtalkProviderError(503, 'upstream unavailable')).toBe(
      '알림톡 발송 실패 [status=503, raw="upstream unavailable"]',
    )
  })
})
