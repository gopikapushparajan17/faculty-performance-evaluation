import type { FacultyPosition } from '../types/evaluation'

export interface PositionConfig {
  key: FacultyPosition
  label: string
  description: string
  // Extensible configuration container for future position-specific matrix rules
  part_a_rules?: Record<string, any>
  part_b_rules?: Record<string, any>
  part_c_rules?: Record<string, any>
}

export const POSITION_CONFIGS: Record<FacultyPosition, PositionConfig> = {
  professor: {
    key: 'professor',
    label: 'Professor',
    description: 'Senior academic, research leadership, and institutional development',
  },
  associate_professor: {
    key: 'associate_professor',
    label: 'Associate Professor',
    description: 'Mid-career academic, advanced teaching, and independent research contributions',
  },
  assistant_professor: {
    key: 'assistant_professor',
    label: 'Assistant Professor',
    description: 'Early-career academic, core instructional responsibilities, and research foundation',
  },
}

export function getPositionTitle(position?: string): string {
  if (position === 'professor') return 'Professor'
  if (position === 'assistant_professor') return 'Assistant Professor'
  return 'Associate Professor'
}

export interface CategoryMaximums {
  tlp: number
  research: number
  others: number
}

export const CATEGORY_MAXIMUMS: Record<FacultyPosition, CategoryMaximums> = {
  professor: { tlp: 20, research: 60, others: 20 },
  associate_professor: { tlp: 30, research: 50, others: 20 },
  assistant_professor: { tlp: 40, research: 40, others: 20 },
}

export const ELIGIBILITY_PERCENTAGE = 0.65

export interface CategoryThresholds {
  tlpThreshold: number
  researchThreshold: number
  othersThreshold: number | null
  tlpMax: number
  researchMax: number
  othersMax: number
}

export function getCategoryThresholds(pos?: string): CategoryThresholds {
  const position = (pos || 'associate_professor') as FacultyPosition
  const maxes = CATEGORY_MAXIMUMS[position] || CATEGORY_MAXIMUMS.associate_professor
  return {
    tlpMax: maxes.tlp,
    researchMax: maxes.research,
    othersMax: maxes.others,
    tlpThreshold: Math.round(maxes.tlp * ELIGIBILITY_PERCENTAGE * 10) / 10,
    researchThreshold: Math.round(maxes.research * ELIGIBILITY_PERCENTAGE * 10) / 10,
    othersThreshold: null, // No minimum eligibility
  }
}

export interface EligibilityResult {
  tlpActual: number
  researchActual: number
  othersActual: number
  grandTotal: number
  tlpMax: number
  researchMax: number
  othersMax: number
  tlpThreshold: number
  researchThreshold: number
  isTlpEligible: boolean
  isResearchEligible: boolean
  isOverallEligible: boolean
}

export function calculateEligibility(
  tlpActual: number,
  researchActual: number,
  othersActual: number,
  pos?: string,
): EligibilityResult {
  const { tlpMax, researchMax, othersMax, tlpThreshold, researchThreshold } = getCategoryThresholds(pos)
  const isTlpEligible = tlpActual >= tlpThreshold
  const isResearchEligible = researchActual >= researchThreshold
  const isOverallEligible = isTlpEligible && isResearchEligible
  return {
    tlpActual,
    researchActual,
    othersActual,
    grandTotal: tlpActual + researchActual + othersActual,
    tlpMax,
    researchMax,
    othersMax,
    tlpThreshold,
    researchThreshold,
    isTlpEligible,
    isResearchEligible,
    isOverallEligible,
  }
}
