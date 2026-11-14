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
