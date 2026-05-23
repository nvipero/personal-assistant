import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fi } from '@/i18n/fi'
import type { MemoryCategory, UserMemory } from '@/types/database'

const MAX_CHARS = 500
const CATEGORIES: MemoryCategory[] = ['people', 'preferences', 'context']

interface Props {
  open: boolean
  onClose: () => void
  onSave: (content: string, category: MemoryCategory) => void
  saving?: boolean
  initialValues?: Pick<UserMemory, 'content' | 'category'>
}

export default function MemoryDialog({ open, onClose, onSave, saving, initialValues }: Props) {
  const [content, setContent] = useState(initialValues?.content ?? '')
  const [category, setCategory] = useState<MemoryCategory>(initialValues?.category ?? 'context')

  useEffect(() => {
    if (open) {
      setContent(initialValues?.content ?? '')
      setCategory(initialValues?.category ?? 'context')
    }
  }, [open, initialValues?.content, initialValues?.category])

  const charsLeft = MAX_CHARS - content.length
  const canSave = content.trim().length > 0 && content.length <= MAX_CHARS

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initialValues ? fi.memory.editTitle : fi.memory.addTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{fi.memory.categoryLabel}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as MemoryCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {fi.memory.categories[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{fi.memory.contentLabel}</Label>
            <Textarea
              placeholder={fi.memory.contentPlaceholder}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="text-sm"
            />
            <p className={`text-xs text-right ${charsLeft < 50 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {fi.memory.charsRemaining(charsLeft)}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {fi.memory.cancel}
          </Button>
          <Button onClick={() => onSave(content.trim(), category)} disabled={!canSave || saving}>
            {saving ? fi.settings.saving : fi.memory.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
