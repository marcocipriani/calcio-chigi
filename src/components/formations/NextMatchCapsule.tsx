"use client"

import { format } from "date-fns"
import { it } from "date-fns/locale"
import Link from "next/link"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export type NextMatchSummary = {
  id: string
  opponent: string
  opponentLogoUrl: string | null
  startsAt: string
  publishedAt: string | null
}

function formatInRome(value: string, pattern: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value)
  const romeDate = new Date(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  )
  return format(romeDate, pattern, { locale: it })
}

function CapsuleContent({ match }: { match: NextMatchSummary }) {
  const published = match.publishedAt !== null

  return (
    <span
      className={cn(
        "flex min-h-14 min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2",
        published
          ? "border-red-700 bg-red-700 text-white"
          : "border-red-600 bg-background text-red-700",
      )}
      data-state={published ? "published" : "draft"}
      data-testid="next-match-capsule"
    >
      <Avatar className="size-9 shrink-0 border bg-white">
        <AvatarImage
          alt={`Logo ${match.opponent}`}
          className="object-contain p-0.5"
          src={match.opponentLogoUrl ?? undefined}
        />
        <AvatarFallback className="bg-white text-xs font-black text-red-700">
          {match.opponent.trim().charAt(0).toLocaleUpperCase("it")}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black leading-tight">
          {match.opponent}
        </span>
        <span
          className={cn(
            "block text-[11px] leading-tight",
            published ? "text-white/80" : "text-red-700/80",
          )}
        >
          {formatInRome(match.startsAt, "EEE d MMM · HH:mm")}
        </span>
        <span className="mt-0.5 block text-[11px] font-semibold leading-tight">
          {published
            ? `Pubblicata il ${formatInRome(match.publishedAt!, "d MMM · HH:mm")}`
            : "Da pubblicare"}
        </span>
      </span>
    </span>
  )
}

export function NextMatchCapsule({
  match,
}: {
  match: NextMatchSummary
}): React.JSX.Element {
  if (match.publishedAt) {
    return (
      <Link
        aria-label={`Formazione ufficiale contro ${match.opponent}`}
        className="block min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        href={`/evento/${match.id}`}
      >
        <CapsuleContent match={match} />
      </Link>
    )
  }

  return <CapsuleContent match={match} />
}
