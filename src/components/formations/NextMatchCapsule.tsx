"use client"

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

function formatInRome(value: string, includeWeekday: boolean) {
  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: includeWeekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ""
  const date = [
    includeWeekday ? part("weekday") : null,
    part("day"),
    part("month").replace(/\.$/, ""),
  ]
    .filter(Boolean)
    .join(" ")
  return `${date} · ${part("hour")}:${part("minute")}`
}

function CapsuleContent({ match }: { match: NextMatchSummary }) {
  const published = match.publishedAt !== null

  return (
    <div
      className={cn(
        "flex min-h-14 min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2",
        published
          ? "border-red-700 bg-red-700 text-white"
          : "border-red-600 bg-white text-red-700 dark:bg-white dark:text-red-700",
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
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black leading-tight">
          {match.opponent}
        </p>
        <p
          className={cn(
            "text-[11px] leading-tight",
            published ? "text-white/80" : "text-red-700/80",
          )}
        >
          {formatInRome(match.startsAt, true)}
        </p>
        <p className="mt-0.5 text-[11px] font-semibold leading-tight">
          {published
            ? `Pubblicata il ${formatInRome(match.publishedAt!, false)}`
            : "Da pubblicare"}
        </p>
      </div>
    </div>
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
