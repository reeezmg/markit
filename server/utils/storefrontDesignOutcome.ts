export function storefrontDesignOutcome(run: any): 'WAITING' | 'FAILED' | 'VERIFIED' {
  if (['failed', 'cancelled', 'canceled', 'incomplete', 'budget_exceeded'].includes(run?.status)) return 'FAILED'
  if (run?.status !== 'completed') return 'WAITING'
  const result = run.runtimeResult
  const proof = result?.designValidation
  return result?.codeChanged === true && result.savedSha && result.savedSha !== result.beforeSha
    && proof?.version === 1 && proof.passed === true && proof.skill === '.agents/skills/storefront-design/SKILL.md'
    && proof.sourceFiles?.some((file: string) => file.startsWith('src/'))
    && proof.checks?.some((check: any) => check.width === 390)
    && proof.checks?.some((check: any) => check.width === 1440)
    ? 'VERIFIED' : 'FAILED'
}
