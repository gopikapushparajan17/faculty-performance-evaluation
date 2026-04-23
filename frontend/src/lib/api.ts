import axios from "axios"

export const api = axios.create({
  baseURL: "http://localhost:8000/api"
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("faculty_eval_token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export async function downloadPdf(evaluationId: string, userId?: string): Promise<void> {
  const res = await api.get(`/pdf/${evaluationId}`, { responseType: "blob" })
  const blob = new Blob([res.data], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank")
  // Track per-evaluation and per-user
  localStorage.setItem(`pdf_viewed_${evaluationId}`, "1")
  if (userId) localStorage.setItem(`pdf_viewed_${evaluationId}_${userId}`, "1")
}

export function hasPdfBeenViewed(evaluationId: string, userId?: string): boolean {
  if (userId && localStorage.getItem(`pdf_viewed_${evaluationId}_${userId}`)) return true
  return !!localStorage.getItem(`pdf_viewed_${evaluationId}`)
}
