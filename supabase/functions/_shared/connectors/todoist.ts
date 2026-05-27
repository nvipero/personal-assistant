import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptToken } from '../crypto.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type TodoistTask = {
  id: string
  content: string
  description?: string
  priority: number
  due?: { date: string; datetime?: string; is_recurring: boolean }
  project_id: string
  labels: string[]
}

export type TodoistData = {
  today: TodoistTask[]
  overdue: TodoistTask[]
  upcoming: TodoistTask[]
  projectNames: Record<string, string>
}

export async function fetchTodoistTasks(
  userId: string,
  timezone: string,
  todayStr: string
): Promise<TodoistData | null> {
  const client = createClient(supabaseUrl, serviceRoleKey)

  try {
    const { data: integration } = await client
      .from('user_integrations')
      .select('access_token, revoked_at')
      .eq('user_id', userId)
      .eq('provider', 'todoist')
      .maybeSingle()

    if (!integration || integration.revoked_at) return null

    const token = await decryptToken(integration.access_token as unknown as Uint8Array)

    const headers = { Authorization: `Bearer ${token}` }

    const [tasksRes, projectsRes] = await Promise.all([
      fetch('https://api.todoist.com/api/v1/tasks', { headers }),
      fetch('https://api.todoist.com/api/v1/projects', { headers }),
    ])

    if (tasksRes.status === 401) {
      await client.from('user_integrations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', userId).eq('provider', 'todoist')
      return null
    }

    if (!tasksRes.ok) return null

    const tasks = await tasksRes.json() as TodoistTask[]
    const projectNames: Record<string, string> = {}
    if (projectsRes.ok) {
      const projects = await projectsRes.json() as Array<{ id: string; name: string }>
      for (const p of projects) projectNames[p.id] = p.name
    }

    await client.from('user_integrations')
      .update({ last_used_at: new Date().toISOString() })
      .eq('user_id', userId).eq('provider', 'todoist')

    const today = new Date(todayStr)
    const in7Days = new Date(todayStr)
    in7Days.setDate(in7Days.getDate() + 7)

    const todayTasks: TodoistTask[] = []
    const overdueTasks: TodoistTask[] = []
    const upcomingTasks: TodoistTask[] = []

    for (const task of tasks) {
      if (!task.due) continue
      const dueDate = new Date(task.due.date)
      const dueDateStr = task.due.date

      if (dueDateStr === todayStr) {
        todayTasks.push(task)
      } else if (dueDate < today) {
        overdueTasks.push(task)
      } else if (dueDate <= in7Days && task.priority >= 3) {
        upcomingTasks.push(task)
      }
    }

    todayTasks.sort((a, b) => {
      if (a.due?.datetime && b.due?.datetime) return a.due.datetime.localeCompare(b.due.datetime)
      if (a.due?.datetime) return -1
      if (b.due?.datetime) return 1
      return b.priority - a.priority
    })

    overdueTasks.sort((a, b) => {
      const da = new Date(a.due!.date).getTime()
      const db = new Date(b.due!.date).getTime()
      return da - db
    })

    upcomingTasks.sort((a, b) => {
      const da = new Date(a.due!.date).getTime()
      const db = new Date(b.due!.date).getTime()
      return da !== db ? da - db : b.priority - a.priority
    })

    return { today: todayTasks, overdue: overdueTasks, upcoming: upcomingTasks, projectNames }
  } catch {
    return null
  }
}
