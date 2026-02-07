import { useParams, useNavigate } from 'react-router-dom'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { useEffect, useMemo } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import ModuleCard from '../components/ModuleCard'
import ProofUpload from '../components/ProofUpload'
import {
  studentFeedbackPoints,
  conferencePoints,
  bookChaptersPoints,
  booksPoints,
  iprPoints,
  fundedPoints,
  fdpAttendedPoints,
  talksPoints,
  deptActivitiesPoints,
  instActivitiesPoints,
  fdpOrganizedPoints,
  computeTotalPoints,
} from '../lib/pointRules'
import type { Evaluation, EvaluationModules } from '../types/evaluation'

const defaultModules: EvaluationModules = {
  student_feedback: { percentage: '', points: 0 },
  journal_index: { value: '' },
  conference_articles: { entries: [], points: 0 },
  book_chapters: { entries: [], points: 0 },
  books: { entries: [], points: 0 },
  ipr: { entries: [], points: 0 },
  funded_projects: { entries: [], points: 0 },
  fdp_attended: { entries: [], points: 0 },
  talks_delivered: { entries: [], points: 0 },
  departmental_activities: { entries: [], points: 0 },
  institutional_activities: { entries: [], points: 0 },
  fdp_organized: { entries: [], points: 0 },
}

type FormValues = Omit<Evaluation, 'id' | 'created_at' | 'updated_at'> & { id?: string }

export default function EvaluationForm() {
  const { evaluationId, facultyId } = useParams<{ evaluationId?: string; facultyId?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isNew = !evaluationId
  const editId = evaluationId

  const form = useForm<FormValues>({
    defaultValues: {
      faculty_id: facultyId ?? '',
      academic_year: new Date().getFullYear().toString(),
      status: 'draft',
      modules: defaultModules,
      total_points: 0,
    },
  })

  const modules = useWatch({ control: form.control, name: 'modules', defaultValue: defaultModules })

  const computed = useMemo(() => {
    const m = modules ?? defaultModules
    const sf = studentFeedbackPoints(Number(m.student_feedback?.percentage) || 0)
    const conf = conferencePoints(m.conference_articles?.entries?.length ?? 0)
    const bc = bookChaptersPoints(m.book_chapters?.entries?.length ?? 0)
    const books = booksPoints(m.books?.entries ?? [])
    const ipr = iprPoints(m.ipr?.entries ?? [])
    const funded = (m.funded_projects?.entries ?? []).reduce((s, e) => s + fundedPoints(Number(e.amount_lakhs) || 0), 0)
    const fdpA = fdpAttendedPoints(m.fdp_attended?.entries ?? [])
    const talks = talksPoints(m.talks_delivered?.entries?.length ?? 0)
    const dept = deptActivitiesPoints(m.departmental_activities?.entries?.length ?? 0)
    const inst = instActivitiesPoints(m.institutional_activities?.entries?.length ?? 0)
    const fdpO = fdpOrganizedPoints(m.fdp_organized?.entries ?? [])
    const total = sf + conf + bc + books + ipr + funded + fdpA + talks + dept + inst + fdpO
    return {
      student_feedback: sf,
      conference_articles: conf,
      book_chapters: bc,
      books,
      ipr,
      funded_projects: funded,
      fdp_attended: fdpA,
      talks_delivered: talks,
      departmental_activities: dept,
      institutional_activities: inst,
      fdp_organized: fdpO,
      total,
    }
  }, [modules])

  useEffect(() => {
    form.setValue('modules.student_feedback.points', computed.student_feedback)
    form.setValue('modules.conference_articles.points', computed.conference_articles)
    form.setValue('modules.book_chapters.points', computed.book_chapters)
    form.setValue('modules.books.points', computed.books)
    form.setValue('modules.ipr.points', computed.ipr)
    form.setValue('modules.funded_projects.points', computed.funded_projects)
    form.setValue('modules.fdp_attended.points', computed.fdp_attended)
    form.setValue('modules.talks_delivered.points', computed.talks_delivered)
    form.setValue('modules.departmental_activities.points', computed.departmental_activities)
    form.setValue('modules.institutional_activities.points', computed.institutional_activities)
    form.setValue('modules.fdp_organized.points', computed.fdp_organized)
    form.setValue('total_points', computed.total)
  }, [computed, form])

  useEffect(() => {
    if (editId) {
      api.get<Evaluation>(`/evaluations/${editId}`).then(({ data }) => {
        form.reset({
          ...data,
          id: data.id,
          modules: data.modules ?? defaultModules,
        })
      }).catch(() => {})
    } else if (facultyId) {
      form.setValue('faculty_id', facultyId)
    }
  }, [editId, facultyId, form])

  const onSubmit = async (data: FormValues) => {
    if (isNew) {
      const { data: ev } = await api.post<Evaluation>('/evaluations', { ...data, id: undefined })
      navigate(`/evaluation/${ev.id}/view`)
    } else if (data.id) {
      await api.put(`/evaluations/${data.id}`, data)
      navigate(`/evaluation/${data.id}/view`)
    }
  }

  const submitEval = async () => {
    const data = form.getValues()
    await api.post(`/evaluations/${data.id}/submit`)
    form.setValue('status', 'submitted')
  }

  return (
    <div className="max-w-4xl">
      <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>Evaluation Form</h1>
      <p className="form-label" style={{ marginBottom: '1.5rem' }}>Academic year: {form.watch('academic_year')}</p>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Module 1: Student Feedback */}
        <ModuleCard title="1. Student Feedback" points={computed.student_feedback} defaultOpen>
          <p className="form-label" style={{ marginBottom: '0.5rem' }}>≥85% → 15 pts, 70–84% → 10, 60–69% → 7, &lt;60% → 5</p>
          <select {...form.register('modules.student_feedback.percentage')} className="input input-w-40">
            <option value="">Select %</option>
            {['90', '85', '80', '75', '70', '65', '60', '55', '50'].map((p) => (
              <option key={p} value={p}>{p}%</option>
            ))}
          </select>
        </ModuleCard>

        {/* Module 2: Journal Index (disabled) */}
        <ModuleCard title="2. Journal Index" points={0} defaultOpen>
          <input type="text" disabled placeholder="Disabled for now" className="input input-disabled" style={{ width: '100%' }} />
        </ModuleCard>

        {/* Module 3: Conference Articles - max 4, 4 pts each */}
        <ConferenceArticlesModule form={form} points={computed.conference_articles} />

        {/* Module 4: Book Chapters - max 4, 6 pts each */}
        <BookChaptersModule form={form} points={computed.book_chapters} />

        {/* Module 5: Books - max 3, authored 20 / edited 10 */}
        <BooksModule form={form} points={computed.books} />

        {/* Module 6: IPR */}
        <IPRModule form={form} points={computed.ipr} />

        {/* Module 7: Funded Projects */}
        <FundedProjectsModule form={form} points={computed.funded_projects} />

        {/* Module 8: FDP Attended - max 2 */}
        <FDPAttendedModule form={form} points={computed.fdp_attended} />

        {/* Module 9: Talks - max 2, 5 pts each */}
        <TalksModule form={form} points={computed.talks_delivered} />

        {/* Module 10: Departmental - max 3, 3 pts each */}
        <DeptActivitiesModule form={form} points={computed.departmental_activities} />

        {/* Module 11: Institutional - max 3, 5 pts each */}
        <InstActivitiesModule form={form} points={computed.institutional_activities} />

        {/* Module 12: FDP Organized - max 2 */}
        <FDPOrganizedModule form={form} points={computed.fdp_organized} />

        <div className="total-box">
          <p>Grand Total: {computed.total} points</p>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">Save {isNew ? 'Draft' : ''}</button>
          {user?.role === 'hod' && form.watch('status') === 'draft' && form.watch('id') && (
            <button type="button" onClick={submitEval} className="btn btn-secondary">Submit Evaluation</button>
          )}
          <button type="button" onClick={() => navigate(-1)} className="btn btn-outline">Cancel</button>
        </div>
      </form>
    </div>
  )
}

function ConferenceArticlesModule({ form, points }: { form: ReturnType<typeof useForm<FormValues>>; points: number }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'modules.conference_articles.entries' })
  return (
    <ModuleCard title="3. Conference Articles (max 4, 4 pts each)" points={points} defaultOpen>
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input placeholder="Title" {...form.register(`modules.conference_articles.entries.${i}.title`)} className="input input-flex" />
          <ProofUpload
            value={form.watch(`modules.conference_articles.entries.${i}.proof_file`)}
            onChange={(url) => form.setValue(`modules.conference_articles.entries.${i}.proof_file`, url)}
            prefix="conference_articles"
          />
          {fields.length > 0 && <button type="button" onClick={() => remove(i)} className="remove-link">Remove</button>}
        </div>
      ))}
      {fields.length < 4 && <button type="button" onClick={() => append({ title: '' })} className="add-link">+ Add</button>}
    </ModuleCard>
  )
}

function BookChaptersModule({ form, points }: { form: ReturnType<typeof useForm<FormValues>>; points: number }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'modules.book_chapters.entries' })
  return (
    <ModuleCard title="4. Book Chapters (max 4, 6 pts each)" points={points} defaultOpen>
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input placeholder="Title" {...form.register(`modules.book_chapters.entries.${i}.title`)} className="input input-flex" />
          <ProofUpload value={form.watch(`modules.book_chapters.entries.${i}.proof_file`)} onChange={(url) => form.setValue(`modules.book_chapters.entries.${i}.proof_file`, url)} prefix="book_chapters" />
          {fields.length > 0 && <button type="button" onClick={() => remove(i)} className="remove-link">Remove</button>}
        </div>
      ))}
      {fields.length < 4 && <button type="button" onClick={() => append({ title: '' })} className="add-link">+ Add</button>}
    </ModuleCard>
  )
}

function BooksModule({ form, points }: { form: ReturnType<typeof useForm<FormValues>>; points: number }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'modules.books.entries' })
  return (
    <ModuleCard title="5. Authored / Edited Books (max 3, Authored 20 / Edited 10 pts)" points={points} defaultOpen>
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input placeholder="Title" {...form.register(`modules.books.entries.${i}.title`)} className="input input-flex" />
          <select {...form.register(`modules.books.entries.${i}.type`)} className="input input-w-32">
            <option value="authored">Authored</option>
            <option value="edited">Edited</option>
          </select>
          <ProofUpload value={form.watch(`modules.books.entries.${i}.proof_file`)} onChange={(url) => form.setValue(`modules.books.entries.${i}.proof_file`, url)} prefix="books" />
          {fields.length > 0 && <button type="button" onClick={() => remove(i)} className="remove-link">Remove</button>}
        </div>
      ))}
      {fields.length < 3 && <button type="button" onClick={() => append({ title: '', type: 'authored' })} className="add-link">+ Add</button>}
    </ModuleCard>
  )
}

function IPRModule({ form, points }: { form: ReturnType<typeof useForm<FormValues>>; points: number }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'modules.ipr.entries' })
  return (
    <ModuleCard title="6. IPR (Patent 30, Copyright 10, Trademark 10 pts)" points={points} defaultOpen>
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <select {...form.register(`modules.ipr.entries.${i}.type`)} className="input input-w-32">
            <option value="patent">Patent</option>
            <option value="copyright">Copyright</option>
            <option value="trademark">Trademark</option>
          </select>
          <input placeholder="Description" {...form.register(`modules.ipr.entries.${i}.description`)} className="input input-flex" />
          <ProofUpload value={form.watch(`modules.ipr.entries.${i}.proof_file`)} onChange={(url) => form.setValue(`modules.ipr.entries.${i}.proof_file`, url)} prefix="ipr" />
          <button type="button" onClick={() => remove(i)} className="remove-link">Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => append({ type: 'patent', description: '' })} className="add-link">+ Add</button>
    </ModuleCard>
  )
}

function FundedProjectsModule({ form, points }: { form: ReturnType<typeof useForm<FormValues>>; points: number }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'modules.funded_projects.entries' })
  return (
    <ModuleCard title="7. Funded Projects / Consultancy (Lakhs: >1→5, 1-2→10, 2-3→12, 3-5→15, >5→20)" points={points} defaultOpen>
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input type="number" step="0.1" placeholder="Amount (L)" {...form.register(`modules.funded_projects.entries.${i}.amount_lakhs`, { valueAsNumber: true })} className="input input-w-24" />
          <input placeholder="Description" {...form.register(`modules.funded_projects.entries.${i}.description`)} className="input input-flex" />
          <ProofUpload value={form.watch(`modules.funded_projects.entries.${i}.proof_file`)} onChange={(url) => form.setValue(`modules.funded_projects.entries.${i}.proof_file`, url)} prefix="funded_projects" />
          <button type="button" onClick={() => remove(i)} className="remove-link">Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => append({ amount_lakhs: 0, description: '' })} className="add-link">+ Add</button>
    </ModuleCard>
  )
}

function FDPAttendedModule({ form, points }: { form: ReturnType<typeof useForm<FormValues>>; points: number }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'modules.fdp_attended.entries' })
  return (
    <ModuleCard title="8. FDP / Workshops Attended (max 2; 3d→3, 5d→5, 2w→10 pts)" points={points} defaultOpen>
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input placeholder="Name" {...form.register(`modules.fdp_attended.entries.${i}.name`)} className="input input-w-48" />
          <input type="number" placeholder="Days" {...form.register(`modules.fdp_attended.entries.${i}.days`, { valueAsNumber: true })} className="input input-w-20" />
          <ProofUpload value={form.watch(`modules.fdp_attended.entries.${i}.proof_file`)} onChange={(url) => form.setValue(`modules.fdp_attended.entries.${i}.proof_file`, url)} prefix="fdp_attended" />
          {fields.length > 0 && <button type="button" onClick={() => remove(i)} className="remove-link">Remove</button>}
        </div>
      ))}
      {fields.length < 2 && <button type="button" onClick={() => append({ name: '', days: 0 })} className="add-link">+ Add</button>}
    </ModuleCard>
  )
}

function TalksModule({ form, points }: { form: ReturnType<typeof useForm<FormValues>>; points: number }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'modules.talks_delivered.entries' })
  return (
    <ModuleCard title="9. Talks Delivered (max 2, 5 pts each)" points={points} defaultOpen>
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input placeholder="Title" {...form.register(`modules.talks_delivered.entries.${i}.title`)} className="input input-flex" />
          <ProofUpload value={form.watch(`modules.talks_delivered.entries.${i}.proof_file`)} onChange={(url) => form.setValue(`modules.talks_delivered.entries.${i}.proof_file`, url)} prefix="talks_delivered" />
          {fields.length > 0 && <button type="button" onClick={() => remove(i)} className="remove-link">Remove</button>}
        </div>
      ))}
      {fields.length < 2 && <button type="button" onClick={() => append({ title: '' })} className="add-link">+ Add</button>}
    </ModuleCard>
  )
}

function DeptActivitiesModule({ form, points }: { form: ReturnType<typeof useForm<FormValues>>; points: number }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'modules.departmental_activities.entries' })
  return (
    <ModuleCard title="10. Departmental Activities (max 3, 3 pts each)" points={points} defaultOpen>
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input placeholder="Description" {...form.register(`modules.departmental_activities.entries.${i}.description`)} className="input input-flex" />
          <ProofUpload value={form.watch(`modules.departmental_activities.entries.${i}.proof_file`)} onChange={(url) => form.setValue(`modules.departmental_activities.entries.${i}.proof_file`, url)} prefix="departmental_activities" />
          {fields.length > 0 && <button type="button" onClick={() => remove(i)} className="remove-link">Remove</button>}
        </div>
      ))}
      {fields.length < 3 && <button type="button" onClick={() => append({ description: '' })} className="add-link">+ Add</button>}
    </ModuleCard>
  )
}

function InstActivitiesModule({ form, points }: { form: ReturnType<typeof useForm<FormValues>>; points: number }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'modules.institutional_activities.entries' })
  return (
    <ModuleCard title="11. Institutional Activities (max 3, 5 pts each)" points={points} defaultOpen>
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input placeholder="Description" {...form.register(`modules.institutional_activities.entries.${i}.description`)} className="input input-flex" />
          <ProofUpload value={form.watch(`modules.institutional_activities.entries.${i}.proof_file`)} onChange={(url) => form.setValue(`modules.institutional_activities.entries.${i}.proof_file`, url)} prefix="institutional_activities" />
          {fields.length > 0 && <button type="button" onClick={() => remove(i)} className="remove-link">Remove</button>}
        </div>
      ))}
      {fields.length < 3 && <button type="button" onClick={() => append({ description: '' })} className="add-link">+ Add</button>}
    </ModuleCard>
  )
}

function FDPOrganizedModule({ form, points }: { form: ReturnType<typeof useForm<FormValues>>; points: number }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'modules.fdp_organized.entries' })
  return (
    <ModuleCard title="12. FDP / Workshops / Conferences Organized (max 2; 1d→2, 3d→5, 5d→10 pts)" points={points} defaultOpen>
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input placeholder="Name" {...form.register(`modules.fdp_organized.entries.${i}.name`)} className="input input-w-48" />
          <input type="number" placeholder="Days" {...form.register(`modules.fdp_organized.entries.${i}.days`, { valueAsNumber: true })} className="input input-w-20" />
          <ProofUpload value={form.watch(`modules.fdp_organized.entries.${i}.proof_file`)} onChange={(url) => form.setValue(`modules.fdp_organized.entries.${i}.proof_file`, url)} prefix="fdp_organized" />
          {fields.length > 0 && <button type="button" onClick={() => remove(i)} className="remove-link">Remove</button>}
        </div>
      ))}
      {fields.length < 2 && <button type="button" onClick={() => append({ name: '', days: 0 })} className="add-link">+ Add</button>}
    </ModuleCard>
  )
}
