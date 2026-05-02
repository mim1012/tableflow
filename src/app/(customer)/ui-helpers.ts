export const WAITING_PHONE_DIGITS = 11

export function getWaitingPhoneDigits(phone: string) {
  return phone.replace(/\D/g, '').length
}

export function isWaitingPhoneComplete(phone: string) {
  return getWaitingPhoneDigits(phone) >= WAITING_PHONE_DIGITS
}

export function getWaitingPhoneGuideText(phone: string) {
  const remaining = Math.max(0, WAITING_PHONE_DIGITS - getWaitingPhoneDigits(phone))

  if (remaining === 0) {
    return '휴대폰 번호 입력이 완료되었어요. 다음으로 진행해 주세요.'
  }

  return `휴대폰 번호 ${remaining}자리를 더 입력하면 다음으로 진행할 수 있어요. 하이픈은 자동으로 입력돼요.`
}

export function getWaitingNextButtonHelperText(phone: string, isSubmitting: boolean) {
  if (isSubmitting) {
    return '대기 등록을 처리하고 있어요.'
  }

  return getWaitingPhoneGuideText(phone)
}

export function getSafeMenuImageSrc(src?: string | null) {
  const value = src?.trim()

  if (!value) return null
  if (/^(https?:)?\/\//.test(value) || value.startsWith('/')) return value

  return null
}
