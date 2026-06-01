export const DEFAULT_STAFF_CALL_OPTION_NAMES = [
  '직원만 호출',
  '물/얼음물 주세요',
  '물티슈 주세요',
  '앞치마 주세요',
  '주문 수정할게요',
] as const

export function normalizeStaffCallOptionNames(optionNames: string[] | null | undefined): string[] {
  const normalized = (optionNames ?? [])
    .map((name) => name.trim())
    .filter((name, index, arr) => name.length > 0 && arr.indexOf(name) === index)

  return normalized.length > 0 ? normalized : [...DEFAULT_STAFF_CALL_OPTION_NAMES]
}
