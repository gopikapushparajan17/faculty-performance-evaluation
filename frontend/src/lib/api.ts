import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

const token = typeof localStorage !== 'undefined' ? localStorage.getItem('faculty_eval_token') : null
if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`
