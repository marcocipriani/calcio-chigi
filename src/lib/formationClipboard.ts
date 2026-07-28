import { toast } from "sonner"

type ClipboardWriter = (message: string) => Promise<void>

export async function copyOfficialFormationMessage(
  message: string,
  writeText: ClipboardWriter = (value) =>
    navigator.clipboard.writeText(value),
): Promise<boolean> {
  try {
    await writeText(message)
    toast.success("Messaggio WhatsApp copiato")
    return true
  } catch {
    toast.error(
      "Impossibile copiare il messaggio WhatsApp. La formazione è rimasta invariata.",
    )
    return false
  }
}
