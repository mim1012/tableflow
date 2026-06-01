import { describe, expect, it } from 'vitest'

import { DEFAULT_STAFF_CALL_OPTION_NAMES, normalizeStaffCallOptionNames } from './staffCallOptions'

describe('staffCallOptions helpers', () => {
  it('returns normalized custom option names when provided', () => {
    expect(
      normalizeStaffCallOptionNames([
        '  직원만 호출  ',
        '',
        '물티슈 주세요',
        '직원만 호출',
      ]),
    ).toEqual(['직원만 호출', '물티슈 주세요'])
  })

  it('falls back to defaults when custom options are empty', () => {
    expect(normalizeStaffCallOptionNames([])).toEqual(DEFAULT_STAFF_CALL_OPTION_NAMES)
    expect(normalizeStaffCallOptionNames(['', '   '])).toEqual(DEFAULT_STAFF_CALL_OPTION_NAMES)
  })
})
