import type { EvaluationModules } from '../types/evaluation'

// ============================================================================
// PHASE 1 — TLP SCORING
// ============================================================================

// 1. Student Feedback: 80–100% = 30; 60–below 80% = 20; below 60% = 0
export function studentFeedbackPoints(pct: number): number {
  if (pct >= 80) return 30
  if (pct >= 60) return 20
  return 0
}

// 2. MOOC Courses: 5 each, maximum 2
export function moocCoursesPoints(count: number): number {
  return Math.min(Math.max(0, count), 2) * 5
}

// 3. Departmental Activities: 3 each
// 4. Institutional Activities: 5 each
// Departmental + Institutional combined maximum = 2 entries. Allow 2 departmental, 2 institutional or 1 of each.
export function computeDeptAndInstPoints(
  deptCount: number,
  instCount: number,
): { deptPoints: number; instPoints: number; total: number } {
  const d = Math.max(0, deptCount)
  const i = Math.max(0, instCount)

  // If combined count is <= 2, compute directly
  if (d + i <= 2) {
    const deptPoints = d * 3
    const instPoints = i * 5
    return { deptPoints, instPoints, total: deptPoints + instPoints }
  }

  // Combined max = 2. When exceeding 2, allocate up to 2 entries prioritizing higher value (institutional = 5 pts)
  const effectiveInst = Math.min(i, 2)
  const effectiveDept = Math.min(d, 2 - effectiveInst)
  const deptPoints = effectiveDept * 3
  const instPoints = effectiveInst * 5
  return { deptPoints, instPoints, total: deptPoints + instPoints }
}

export function deptActivitiesPoints(count: number): number {
  return Math.min(Math.max(0, count), 2) * 3
}

export function instActivitiesPoints(count: number): number {
  return Math.min(Math.max(0, count), 2) * 5
}

// ============================================================================
// PHASE 2 — RESEARCH SCORING
// ============================================================================

// 1. Journal Index: 30 marks per verified paper only after declaration is accepted
export function journalIndexPoints(isVerified: boolean, declarationAccepted: boolean = false): number {
  return (isVerified && declarationAccepted) ? 30 : 0
}

// 2. Conference Articles: 5 each, maximum 2; preserve verification
export function conferencePoints(count: number): number {
  return Math.min(Math.max(0, count), 2) * 5
}

// 3. Book Chapters: 5 each, maximum 2; preserve verification
export function bookChaptersPoints(count: number): number {
  return Math.min(Math.max(0, count), 2) * 5
}

// 4. Authored/Edited Books: 5 each, maximum 2
export function booksPoints(entries: { type?: string }[]): number {
  return Math.min(entries.length, 2) * 5
}

export interface IPRRuleEntry {
  type: string
  description?: string
  proof_file?: string
  verification_status?: string | null
  association_type?: string | null
  inventor_match?: boolean | null
  patent_found?: boolean | null
}

export function isPatentVerifiedInventor(e: IPRRuleEntry): boolean {
  if (e.type !== 'patent') return false
  return (
    e.verification_status === 'verified' &&
    e.patent_found === true &&
    e.inventor_match === true &&
    e.association_type === 'inventor'
  )
}

export function isIPREntryValid(e: IPRRuleEntry): boolean {
  if (e.type === 'patent') {
    return isPatentVerifiedInventor(e)
  }
  if (e.type === 'copyright' || e.type === 'trademark') {
    const hasProof = Boolean(e.proof_file && e.proof_file.trim() && !e.proof_file.startsWith('https://www.scopus.com/'))
    const hasDesc = Boolean(e.description && e.description.trim())
    return hasDesc && hasProof
  }
  return false
}

// 5. IPR: 5 each, maximum 2; preserve verification
export function iprPoints(entries: IPRRuleEntry[]): number {
  const validCount = entries.filter(isIPREntryValid).length
  return Math.min(validCount, 2) * 5
}

// 6. Funded Projects/Consultancy:
//    - ₹2–5 lakh = 5 marks
//    - Above ₹5 lakh = 30 marks
//    - Below ₹2 lakh = 0
export function fundedProjectEntryPoints(amountLakhs: number): number {
  if (amountLakhs > 5) return 30
  if (amountLakhs >= 2) return 5
  return 0
}

export function fundedPoints(amountLakhs: number): number {
  return fundedProjectEntryPoints(amountLakhs)
}

export function fundedProjectsTotalPoints(entries: { amount_lakhs?: number }[]): number {
  return entries.reduce((sum, e) => sum + fundedProjectEntryPoints(Number(e.amount_lakhs) || 0), 0)
}

// 7. PhD Awarded: 5 per student; PDF proof required
export function phdAwardedPoints(count: number): number {
  return Math.max(0, count) * 5
}

// ============================================================================
// PHASE 3 — OTHERS SCORING
// ============================================================================

// 1. Organising FDPs/Workshops:
//    - 5 days = 5 marks
//    - 3–4 days = 4 marks
//    - 1–2 days = 3 marks
export function fdpOrganizedEntryPoints(days: number): number {
  if (days >= 5) return 5
  if (days >= 3) return 4
  if (days >= 1) return 3
  return 0
}

export function fdpOrganizedPoints(entries: { days: number }[]): number {
  return entries.reduce((sum, e) => sum + fdpOrganizedEntryPoints(Number(e.days) || 0), 0)
}

// Factor 2: Conferences Organised
// - General Chair — 5 marks.
// - Session Chair — 3 marks.
// Marks awarded ONLY after confirmation checkbox is selected; if unchecked = 0
export function conferenceOrganizedPoints(role: string, confirmed: boolean): number {
  if (!confirmed) return 0
  if (role === 'General Chair') return 5
  if (role === 'Session Chair') return 3
  return 0
}

// 2. Invited Talks/Resource Person: 5 each, maximum 2
export function talksPoints(count: number): number {
  return Math.min(Math.max(0, count), 2) * 5
}

// 3. MOU Signed: 3 each, maximum 2
export function mouSignedPoints(count: number): number {
  return Math.min(Math.max(0, count), 2) * 3
}

// 4. HOD/Dean: 2 marks
export function hodDeanPoints(heldRole: boolean, hasProof: boolean): number {
  return heldRole && hasProof ? 2 : 0
}

// 5. Organising Industrial Visits: 2 each, maximum 2
export function industrialVisitsPoints(count: number): number {
  return Math.min(Math.max(0, count), 2) * 2
}

// Legacy helper for FDP Attended (preserved if present in legacy records)
export function fdpAttendedPoints(entries: { days: number }[]): number {
  let total = 0
  for (let i = 0; i < Math.min(entries.length, 2); i++) {
    const d = entries[i].days
    if (d >= 14) total += 10
    else if (d >= 5) total += 5
    else if (d >= 3) total += 3
  }
  return total
}

// ============================================================================
// CATEGORY AGGREGATION & UNCAPPED SCORING
// ============================================================================

export function computeTotalPoints(modules: EvaluationModules): number {
  let total = 0
  // Part A — TLP
  total += modules.student_feedback?.points ?? 0
  total += modules.mooc_courses?.points ?? 0
  total += modules.departmental_activities?.points ?? 0
  total += modules.institutional_activities?.points ?? 0

  // Part B — Research
  total += modules.journal_index?.points ?? 0
  total += modules.conference_articles?.points ?? 0
  total += modules.book_chapters?.points ?? 0
  total += modules.books?.points ?? 0
  total += modules.ipr?.points ?? 0
  total += modules.funded_projects?.points ?? 0
  total += modules.phd_awarded?.points ?? 0

  // Part C — Others
  total += modules.fdp_organized?.points ?? 0
  total += modules.conference_organized?.points ?? 0
  total += modules.talks_delivered?.points ?? 0
  total += modules.mou_signed?.points ?? 0
  total += modules.hod_dean_role?.points ?? 0
  total += modules.industrial_visits?.points ?? 0
  total += modules.fdp_attended?.points ?? 0

  return total
}
