import assert from 'node:assert/strict'
import { test } from 'node:test'
import { billingErrorMessage } from '../utils/billing-error'

const fallback = 'Unable to save the bill. Please try again.'

test('offline errors show a clear connection message', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
  try {
    assert.equal(billingErrorMessage(new TypeError('Failed to fetch'), fallback), 'No internet connection')
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
  assert.equal(billingErrorMessage(new Error('No internet connection')), 'No internet connection')
})

test('network failures without a response do not expose request URLs or assume the browser is offline', () => {
  for (const error of [
    new TypeError('Failed to fetch'),
    { message: '[POST] "/api/bill/create": <no response> Failed to fetch' },
    { message: 'Request failed', cause: { code: 'ECONNRESET' } },
    { message: 'Network request failed' },
  ]) {
    assert.equal(billingErrorMessage(error), 'Unable to connect. Check your internet connection and try again.')
  }
})

test('timeouts explain that the request took too long', () => {
  for (const error of [{ name: 'TimeoutError' }, { statusCode: 504 }, { cause: { code: 'ETIMEDOUT' } }]) {
    assert.equal(billingErrorMessage(error), 'The request took too long. Please try again.')
  }
})

test('precise local and server validation messages survive fetch wrappers', () => {
  assert.equal(billingErrorMessage(new Error('Row 2: category is required')), 'Row 2: category is required')
  assert.equal(billingErrorMessage({ statusCode: 409, message: '[POST] "/api/bill/update": 409 Conflict',
    data: { statusMessage: 'Restore the deleted bill before editing it' } }), 'Restore the deleted bill before editing it')
  assert.equal(billingErrorMessage({ data: { message: 'Select a payment method before saving.' } }), 'Select a payment method before saving.')
  assert.equal(billingErrorMessage({ info: { message: 'Phone number is required' } }), 'Phone number is required')
})

test('technical and empty failures use the action-specific fallback', () => {
  for (const message of ['[POST] "/api/bill/create": 500 Internal Server Error',
    'duplicate key value violates unique constraint "entries_pkey"',
    'invalid input syntax for type numeric: "abc"', 'Cannot read properties of undefined',
    'Internal Server Error', 'Bad Gateway', '[object Object]', '']) {
    assert.equal(billingErrorMessage({ data: { statusMessage: message }, message }, fallback), fallback)
  }
  assert.equal(billingErrorMessage(undefined, fallback), fallback)
})

test('generic authorization and throttling errors have actionable messages', () => {
  assert.equal(billingErrorMessage({ statusCode: 401, statusMessage: 'Unauthorized' }), 'Your session has expired. Please sign in again.')
  assert.equal(billingErrorMessage({ statusCode: 403, statusMessage: 'Forbidden' }), 'You do not have permission to perform this action.')
  assert.equal(billingErrorMessage({ statusCode: 429 }), 'Too many requests. Please wait a moment and try again.')
})
