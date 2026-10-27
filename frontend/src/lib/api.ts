import axios from "axios"
import type { PatentVerificationResult } from "../types/evaluation"

export const api = axios.create({
  baseURL: "http://localhost:8000/api"
})

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("faculty_eval_token")

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export async function verifyPatent(payload: {
  patent_number?: string | null
  patent_link?: string | null
}): Promise<PatentVerificationResult> {
  const { data } = await api.post<PatentVerificationResult>("/patents/verify", payload)
  return data
}
