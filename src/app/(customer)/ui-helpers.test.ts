import {
  getSafeMenuImageSrc,
  getWaitingNextButtonHelperText,
  getWaitingPhoneDigits,
  getWaitingPhoneGuideText,
  isWaitingPhoneComplete,
} from './ui-helpers'

describe('customer ui helpers', () => {
  it('counts waiting phone digits without separators', () => {
    expect(getWaitingPhoneDigits('010-1234-5678')).toBe(11)
  })

  it('treats 11-digit waiting phone numbers as complete', () => {
    expect(isWaitingPhoneComplete('010-1234-5678')).toBe(true)
    expect(isWaitingPhoneComplete('010-1234-567')).toBe(false)
  })

  it('explains how many digits remain before continuing', () => {
    expect(getWaitingPhoneGuideText('010')).toContain('8자리를 더 입력')
    expect(getWaitingPhoneGuideText('010-1234-5678')).toContain('입력이 완료되었어요')
  })

  it('prioritizes submitting copy for the waiting CTA helper', () => {
    expect(getWaitingNextButtonHelperText('010-1234-5678', true)).toBe('대기 등록을 처리하고 있어요.')
  })

  it('accepts absolute and root-relative menu images only', () => {
    expect(getSafeMenuImageSrc('https://cdn.example.com/menu.jpg')).toBe('https://cdn.example.com/menu.jpg')
    expect(getSafeMenuImageSrc('/images/menu.jpg')).toBe('/images/menu.jpg')
    expect(getSafeMenuImageSrc('menu.jpg')).toBeNull()
    expect(getSafeMenuImageSrc('')).toBeNull()
  })
})
