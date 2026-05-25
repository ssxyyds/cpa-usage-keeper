import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const credentialStyles = readFileSync(new URL('./CredentialSections.module.scss', import.meta.url), 'utf8')
const credentialShellSource = readFileSync(new URL('./CredentialSectionShell.tsx', import.meta.url), 'utf8')
const aiProviderSectionSource = readFileSync(new URL('./AiProviderCredentialsSection.tsx', import.meta.url), 'utf8')
const authFileSectionSource = readFileSync(new URL('./AuthFileCredentialsSection.tsx', import.meta.url), 'utf8')

describe('Credential section styles', () => {
  it('keeps Auth Files and AI Provider row sizing separate', () => {
    expect(credentialStyles).toMatch(/\.authFileCredentialRow\s*\{[\s\S]*?grid-template-columns:\s*minmax\(190px, 250px\) minmax\(620px, 1\.2fr\) minmax\(300px, 0\.8fr\);/)
    expect(credentialStyles).toMatch(/\.authFileCredentialRow\s*\{[\s\S]*?\.credentialIdentityBlock\s*\{[\s\S]*?max-width:\s*250px;/)
    expect(credentialStyles).toMatch(/\.authFileCredentialRow\s*\{[\s\S]*?@include tablet\s*\{[\s\S]*?grid-template-columns:\s*1fr;/)
    expect(credentialStyles).toMatch(/\.authFileCredentialRow\s*\{[\s\S]*?@include mobile\s*\{[\s\S]*?grid-template-columns:\s*1fr;/)
    expect(credentialStyles).toMatch(/\.aiProviderCredentialRow\s*\{[\s\S]*?grid-template-columns:\s*300px minmax\(394px, max-content\) minmax\(250px, 1fr\);/)
    expect(credentialStyles).toMatch(/\.aiProviderCredentialRow\s*\{[\s\S]*?\.credentialIdentityBlock\s*\{[\s\S]*?max-width:\s*300px;/)
    expect(credentialStyles).toMatch(/\.aiProviderCredentialRow\s*\{[\s\S]*?@include tablet\s*\{[\s\S]*?grid-template-columns:\s*1fr;/)
    expect(credentialStyles).toMatch(/\.aiProviderCredentialRow\s*\{[\s\S]*?@include mobile\s*\{[\s\S]*?grid-template-columns:\s*1fr;/)
    expect(credentialShellSource).toContain('rowClassName?: string')
    expect(aiProviderSectionSource).toContain('rowClassName={styles.aiProviderCredentialRow}')
    expect(authFileSectionSource).toContain('styles.authFileCredentialRow')
    expect(authFileSectionSource).toContain('styles.credentialRowCurrent')
    expect(authFileSectionSource).not.toContain('aiProviderCredentialRow')
  })

  it('lets Auth Files quota bars wrap before their blocks overlap', () => {
    expect(credentialStyles).toMatch(/\.credentialRow\s*\{[\s\S]*?column-gap:\s*18px;/)
    expect(credentialStyles).toMatch(/\.credentialQuotaSideWithAction\s*\{[\s\S]*?grid-template-columns:\s*minmax\(270px, 1fr\) 30px;/)
    expect(credentialStyles).toMatch(/\.credentialQuotaSideWithAction\s*\{[\s\S]*?gap:\s*10px;/)
    expect(credentialStyles).toMatch(/\.credentialQuotaBars\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(120px, 1fr\)\);/)
    expect(credentialStyles).toMatch(/\.credentialQuotaBars\s*\{[\s\S]*?gap:\s*10px;/)
    expect(credentialStyles).toMatch(/\.credentialQuotaBarBlock\s*\{[\s\S]*?min-width:\s*120px;/)
    expect(credentialStyles).not.toContain('credentialQuotaSidePanel')
    expect(credentialStyles).not.toContain('credentialQuotaRow')
  })

  it('keeps Auth Files quota actions inside the mobile card boundary', () => {
    expect(credentialStyles).toMatch(/@include mobile\s*\{[\s\S]*?\.credentialQuotaSideWithAction\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;/)
    expect(credentialStyles).toMatch(/@include mobile\s*\{[\s\S]*?\.credentialQuotaBars\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 120px\), 1fr\)\);/)
    expect(credentialStyles).toMatch(/@include mobile\s*\{[\s\S]*?\.credentialQuotaBarBlock\s*\{[\s\S]*?min-width:\s*0;/)
  })

  it('keeps Total Requests fixed and wraps the breakdown only when it overflows', () => {
    expect(credentialStyles).toMatch(/\.credentialMetricGroup\s*\{[\s\S]*?grid-template-columns:\s*max-content max-content max-content max-content max-content;/)
    expect(credentialStyles).toMatch(/\.credentialMetricGroup\s*\{[\s\S]*?justify-content:\s*start;/)
    expect(authFileSectionSource).toContain('credentialCompactMetricPill')
    expect(authFileSectionSource).toContain('credentialTokenMetricPill')
    expect(authFileSectionSource).toContain('credentialTokenMetric')
    expect(credentialStyles).toMatch(/\.credentialCompactMetricPill\s*\{[\s\S]*?width:\s*96px;/)
    expect(credentialStyles).toMatch(/\.credentialTokenMetricPill\s*\{[\s\S]*?width:\s*120px;/)
    expect(credentialStyles).toMatch(/\.credentialRequestMetric\s*\{[\s\S]*?align-items:\s*baseline;/)
    expect(credentialStyles).toMatch(/\.credentialRequestMetric\s*\{[\s\S]*?flex-wrap:\s*wrap;/)
    expect(credentialStyles).toMatch(/\.credentialRequestMetric\s*\{[\s\S]*?white-space:\s*normal;/)
    expect(credentialStyles).toMatch(/\.credentialRequestBreakdown\s*\{[\s\S]*?display:\s*inline-flex;/)
    expect(credentialStyles).toMatch(/\.credentialRequestBreakdown\s*\{[\s\S]*?white-space:\s*nowrap;/)
    expect(credentialStyles).not.toMatch(/\.credentialRequestBreakdown\s*\{[\s\S]*?flex-basis:\s*100%;/)
    expect(credentialStyles).toMatch(/\.credentialRequestBreakdown\s*\{[\s\S]*?line-height:\s*1\.2;/)
    expect(credentialStyles).toMatch(/\.credentialTokenMetric\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, max-content\) auto;/)
    expect(credentialStyles).toMatch(/\.credentialTokenMetric\s*\{[\s\S]*?white-space:\s*nowrap;/)
  })

  it('keeps Codex score readonly by default inside Auth Files metrics', () => {
    expect(authFileSectionSource).toContain('credentialCodexScorePill')
    expect(authFileSectionSource).toContain('CodexScoreMetric')
    expect(authFileSectionSource).toContain('credentialCodexScoreReadonly')
    expect(authFileSectionSource).not.toContain('<form className={styles.credentialCodexScoreControl}')
    expect(authFileSectionSource).not.toContain('credentialCodexScoreEdit')
    expect(credentialStyles).toMatch(/\.credentialCodexScorePill\s*\{[\s\S]*?grid-column:\s*span 1;/)
    expect(credentialStyles).toMatch(/\.credentialCodexScorePill\s*\{[\s\S]*?justify-self:\s*start;/)
    expect(credentialStyles).toMatch(/\.credentialCodexScorePill\s*\{[\s\S]*?width:\s*fit-content;/)
    expect(credentialStyles).toMatch(/\.credentialCodexScoreReadonly\s*\{[\s\S]*?cursor:\s*text;/)
    expect(credentialStyles).toMatch(/\.credentialCodexScoreReadonly\s*\{[\s\S]*?&:hover:not\(:disabled\),[\s\S]*?&:focus-visible\s*\{[\s\S]*?border-color:/)
  })

  it('highlights the current CPA-selected Codex auth file row', () => {
    expect(authFileSectionSource).toContain('credentialRowCurrent')
    expect(authFileSectionSource).toContain('codex_pool_current_badge')
    expect(credentialStyles).toMatch(/\.credentialRowCurrent\s*\{[\s\S]*?border-left:\s*4px solid #16a34a;/)
    expect(credentialStyles).toMatch(/\.credentialCurrentBadge\s*\{[\s\S]*?background:\s*color-mix\(in srgb, #16a34a 13%, var\(--bg-primary\)\);/)
  })

  it('places Auth File search under the section subtitle and left aligned', () => {
    expect(credentialShellSource).toContain('subtitleExtra?: ReactNode')
    expect(credentialShellSource).toContain('{subtitleExtra && <div className={styles.credentialSectionSubtitleExtra}>{subtitleExtra}</div>}')
    expect(authFileSectionSource).toContain('credentialSearchBar')
    expect(authFileSectionSource).toContain('subtitleExtra={(')
    expect(authFileSectionSource).toContain('credentials_search_placeholder')
    const searchBarBlock = credentialStyles.slice(
      credentialStyles.indexOf('.credentialSearchBar {'),
      credentialStyles.indexOf('.credentialSearchControl')
    )
    expect(credentialStyles).toMatch(/\.credentialSectionSubtitleExtra\s*\{[\s\S]*?margin-top:\s*12px;/)
    expect(searchBarBlock).toContain('justify-content: flex-start;')
    expect(searchBarBlock).not.toContain('border-bottom')
    expect(credentialStyles).toMatch(/\.credentialSearchControl\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(220px, 320px\);/)
  })

  it('uses a fixed centered pagination bar height', () => {
    expect(credentialStyles).toMatch(/\.credentialPagination\s*\{[\s\S]*?--usage-pagination-bar-height:\s*51px;/)
    expect(credentialStyles).toMatch(/\.credentialPagination\s*\{[\s\S]*?height:\s*var\(--usage-pagination-bar-height\);/)
    expect(credentialStyles).toMatch(/\.credentialPagination\s*\{[\s\S]*?box-sizing:\s*border-box;/)
    expect(credentialStyles).toMatch(/\.credentialPagination\s*\{[\s\S]*?align-items:\s*center;/)
    expect(credentialStyles).toMatch(/\.credentialPagination\s*\{[\s\S]*?padding:\s*0 22px;/)
    expect(credentialStyles).toMatch(/@include mobile\s*\{[\s\S]*?\.credentialPagination\s*\{[\s\S]*?overflow-x:\s*auto;/)
    expect(credentialStyles).toMatch(/@include mobile\s*\{[\s\S]*?\.credentialPaginationControls\s*\{[\s\S]*?width:\s*max-content;/)
    expect(credentialStyles).toMatch(/@include mobile\s*\{[\s\S]*?\.credentialPageSizeControl\s*\{[\s\S]*?flex:\s*0 0 auto;/)
  })

  it('keeps plan and remaining-day badges readable in dark mode', () => {
    expect(credentialStyles).toMatch(/\[data-theme='dark'\][\s\S]*\.credentialPlanBadgeTeam[\s\S]*?color:\s*#bbf7d0;/)
    expect(credentialStyles).toMatch(/\[data-theme='dark'\][\s\S]*\.credentialPlanBadgePlus[\s\S]*?color:\s*#bfdbfe;/)
    expect(credentialStyles).toMatch(/\[data-theme='dark'\][\s\S]*\.credentialPlanBadgePro[\s\S]*?color:\s*#fde68a;/)
    expect(credentialStyles).toMatch(/\[data-theme='dark'\][\s\S]*\.credentialRemainingDaysBadge[\s\S]*?color:\s*#bbf7d0;/)
  })
})
