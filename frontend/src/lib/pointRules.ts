import type { EvaluationModules } from '../types/evaluation'

// 1. Student Feedback: ≥85→15, 70-84→10, 60-69→7, <60→5
export function studentFeedbackPoints(pct: number): number {
  if (pct >= 85) return 15
  if (pct >= 70) return 10
  if (pct >= 60) return 7
  return 5
}

// 3. Conference: 4 pts each, max 4
export function conferencePoints(count: number): number {
  return Math.min(count, 4) * 4
}

// 4. Book chapters: 6 pts each, max 4
export function bookChaptersPoints(count: number): number {
  return Math.min(count, 4) * 6
}

// 5. Books: authored 20, edited 10, max 3
export function booksPoints(entries: { type: string }[]): number {
  let total = 0
  for (let i = 0; i < Math.min(entries.length, 3); i++) {
    total += entries[i].type === 'authored' ? 20 : 10
  }
  return total
}

// 6. IPR: patent 30, copyright 10, trademark 10
export function iprPoints(entries: { type: string }[]): number {
  return entries.reduce((sum, e) => {
    if (e.type === 'patent') return sum + 30
    if (e.type === 'copyright' || e.type === 'trademark') return sum + 10
    return sum
  }, 0)
}

// 7. Funded: >1L→5, 1-2→10, 2-3→12, 3-5→15, >5→20
export function fundedPoints(amountLakhs: number): number {
  if (amountLakhs > 5) return 20
  if (amountLakhs >= 3) return 15
  if (amountLakhs >= 2) return 12
  if (amountLakhs >= 1) return 10
  if (amountLakhs > 0) return 5
  return 0
}

// 8. FDP Attended: 3d→3, 5d→5, 14d→10, max 2
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

// 9. Talks: 5 pts each, max 2
export function talksPoints(count: number): number {
  return Math.min(count, 2) * 5
}

// 10. Dept activities: 3 pts each, max 3
export function deptActivitiesPoints(count: number): number {
  return Math.min(count, 3) * 3
}

// 11. Institutional activities: 5 pts each, max 3
export function instActivitiesPoints(count: number): number {
  return Math.min(count, 3) * 5
}

// 12. FDP Organized: 1d→2, 3d→5, 5d→10, max 2
export function fdpOrganizedPoints(entries: { days: number }[]): number {
  let total = 0
  for (let i = 0; i < Math.min(entries.length, 2); i++) {
    const d = entries[i].days
    if (d >= 5) total += 10
    else if (d >= 3) total += 5
    else if (d >= 1) total += 2
  }
  return total
}

export function computeTotalPoints(modules: EvaluationModules): number {
  let total = 0
  total += modules.student_feedback?.points ?? 0
  total += modules.conference_articles?.points ?? 0
  total += modules.book_chapters?.points ?? 0
  total += modules.books?.points ?? 0
  total += modules.ipr?.points ?? 0
  total += modules.funded_projects?.points ?? 0
  total += modules.fdp_attended?.points ?? 0
  total += modules.talks_delivered?.points ?? 0
  total += modules.departmental_activities?.points ?? 0
  total += modules.institutional_activities?.points ?? 0
  total += modules.fdp_organized?.points ?? 0
  return total
}
