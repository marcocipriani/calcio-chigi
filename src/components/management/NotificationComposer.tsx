"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { supabaseBrowser } from "@/lib/supabaseBrowser"

export function NotificationComposer({
  open,
  targetUserIds,
  onOpenChange,
}: {
  open: boolean
  targetUserIds: string[]
  onOpenChange: (open: boolean) => void
}) {
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    const { error } = await supabaseBrowser.rpc("send_manager_notification", {
      p_type: "MANAGER_MESSAGE",
      p_title: String(form.get("title") ?? ""),
      p_body: String(form.get("body") ?? ""),
      p_deep_link: String(form.get("deepLink") ?? "") || null,
      p_target_user_ids: targetUserIds,
      p_critical: form.get("critical") === "on",
    })
    setBusy(false)
    if (error) {
      toast.error("Notifica non inviata", { description: error.message })
      return
    }
    toast.success("Notifica inviata")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-4 sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Invia notifica</DialogTitle>
          <DialogDescription>
            Destinatari con account: {targetUserIds.length}. La notifica sarà
            visibile in app e, se consentito, via push.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="notification-title">Titolo</Label>
            <Input id="notification-title" name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notification-body">Messaggio</Label>
            <Textarea
              className="min-h-24"
              id="notification-body"
              name="body"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notification-link">Collegamento nell’app</Label>
            <Input
              id="notification-link"
              name="deepLink"
              placeholder="/evento/…"
            />
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input className="size-4 accent-primary" name="critical" type="checkbox" />
            Notifica critica, ignora preferenze categoria
          </label>
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Annulla
            </Button>
            <Button disabled={busy || !targetUserIds.length} type="submit">
              {busy ? "Invio…" : "Invia"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
