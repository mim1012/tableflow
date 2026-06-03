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

  it('includes raw JSON when provider returns an unstructured object', () => {
    expect(formatAlimtalkProviderError(402, {
      groupId: 'G4V202606031254259STVY2MZU1YBPFS',
      status: 'PENDING',
      statusCode: '2000',
      reason: '정상 접수(이통사로 접수 예정)',
    })).toBe(
      '알림톡 발송 실패 [status=402, raw={"groupId":"G4V202606031254259STVY2MZU1YBPFS","status":"PENDING","statusCode":"2000","reason":"정상 접수(이통사로 접수 예정)"}]',
    )
  })

  it('falls back safely when provider payload is not an object', () => {
    expect(formatAlimtalkProviderError(503, 'upstream unavailable')).toBe(
      '알림톡 발송 실패 [status=503, raw="upstream unavailable"]',
    )
  })
})
