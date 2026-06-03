type ProviderErrorObject = Record<string, unknown>

function isObject(value: unknown): value is ProviderErrorObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getScalarField(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

function formatFirstNestedError(errors: unknown) {
  if (!Array.isArray(errors) || errors.length === 0) return null

  const first = errors[0]
  if (isObject(first)) {
    const code = getScalarField(first.code)
    const message = getScalarField(first.message)
    if (code && message) return `${code}: ${message}`
    if (message) return message
    if (code) return code
  }

  const raw = getScalarField(first)
  return raw ? raw : null
}

export function formatAlimtalkProviderError(status: number, data: unknown) {
  const parts = [`status=${status}`]

  if (isObject(data)) {
    const code = getScalarField(data.code)
    const message = getScalarField(data.message)
    const details = getScalarField(data.details)
    const firstNestedError = formatFirstNestedError(data.errors)

    if (code) parts.push(`code=${code}`)
    if (message) parts.push(`message=${message}`)
    if (details) parts.push(`details=${details}`)
    if (firstNestedError) parts.push(`errors[0]=${firstNestedError}`)

    if (parts.length === 1) {
      parts.push(`raw=${JSON.stringify(data)}`)
    }
  } else if (typeof data === 'string') {
    parts.push(`raw=${JSON.stringify(data)}`)
  }

  return `알림톡 발송 실패 [${parts.join(', ')}]`
}
