import assert from 'node:assert/strict'
import { test } from 'node:test'
import { storefrontDesignOutcome } from '../server/utils/storefrontDesignOutcome'

const verified = () => ({ status: 'completed', runtimeResult: {
  codeChanged: true, beforeSha: 'starter', savedSha: 'designed', designValidation: {
    version: 1, passed: true, skill: '.agents/skills/storefront-design/SKILL.md', sourceFiles: ['src/style.css'], checks: [{ width: 390 }, { width: 1440 }],
  },
} })
test('old completed no-op runs are failed rather than ready', () => {
  assert.equal(storefrontDesignOutcome({ status: 'completed', runtimeResult: { codeChanged: false, savedSha: 'starter', beforeSha: 'starter' } }), 'FAILED')
})
test('only saved, applied and responsive-verified designs are eligible for ready', () => {
  assert.equal(storefrontDesignOutcome(verified()), 'VERIFIED')
  const missingSkill = verified(); missingSkill.runtimeResult.designValidation.skill = 'missing'
  assert.equal(storefrontDesignOutcome(missingSkill), 'FAILED')
  const noResponsiveCheck = verified(); noResponsiveCheck.runtimeResult.designValidation.checks = [{ width: 1440 }]
  assert.equal(storefrontDesignOutcome(noResponsiveCheck), 'FAILED')
  const notSaved = verified(); notSaved.runtimeResult.savedSha = 'starter'
  assert.equal(storefrontDesignOutcome(notSaved), 'FAILED')
})
test('running and queued work waits; stopped/failed work is retryable', () => {
  for (const status of ['queued', 'in_progress', 'requires_action']) assert.equal(storefrontDesignOutcome({ status }), 'WAITING')
  for (const status of ['failed', 'cancelled', 'canceled', 'incomplete']) assert.equal(storefrontDesignOutcome({ status }), 'FAILED')
})
