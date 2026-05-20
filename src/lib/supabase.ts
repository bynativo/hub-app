import { createClient } from '@supabase/supabase-js'

const SB_URL = 'https://ltgdpbmnvpjwwqkirbxw.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z2RwYm1udnBqd3dxa2lyYnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMzg1MjEsImV4cCI6MjA5NDgxNDUyMX0._jadsDDIg7ed6djmFWJX1sJkecbID6MwauAqvl0gZj4'

export const supabase = createClient(SB_URL, SB_KEY)
