import { supabase } from '@/lib/supabase'

export async function callEdgeFunction<T = unknown>(
  name: string,
  body?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data as T
}
