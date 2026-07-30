"use client"

import Image from "next/image"
import Link from "next/link"
import { Moon, Sun, UserCircle, UsersRound } from "lucide-react"
import { useTheme } from "next-themes"

import { useAppSession } from "@/components/auth/AppSessionProvider"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { ManagerPresence } from "@/components/management/ManagerPresence"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function SiteHeader() {
  const { resolvedTheme, setTheme } = useTheme()
  const { isManager, profile, user } = useAppSession()
  const profileLink = user ? "/profilo" : "/login"
  const displayName = profile
    ? `${profile.nome} ${profile.cognome}`.trim()
    : user
      ? "Profilo in attesa"
      : "Accedi"

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/88">
      <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between gap-2 px-2 sm:gap-3 sm:px-5">
        <Link
          className="group flex min-w-0 items-center gap-1.5 rounded-md outline-none transition-transform duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring sm:gap-2.5"
          href="/"
        >
          <span className="relative size-8 shrink-0 sm:size-9">
            <Image
              alt=""
              className="object-contain transition-transform duration-200 motion-safe:group-hover:rotate-2"
              fill
              priority
              sizes="36px"
              src="/icon.png"
            />
          </span>
          <span className="truncate text-[11px] font-black uppercase tracking-tight sm:hidden">
            Calcio Chigi
          </span>
          <span className="hidden truncate text-sm font-black uppercase tracking-tight sm:inline sm:text-base">
            Calcio Circolo Chigi
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {isManager && (
            <div className="flex items-center lg:rounded-full lg:border lg:bg-muted/35 lg:p-0.5">
              <ManagerPresence />
              <Button
                asChild
                className="size-11 rounded-full border-violet-300 px-0 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-500/50 dark:text-violet-300 dark:hover:bg-violet-950/50 lg:ml-2 lg:h-8 lg:w-auto lg:px-3"
                size="sm"
                variant="outline"
              >
                <Link aria-label="Gestione squadra" href="/gestione">
                  <UsersRound aria-hidden="true" />
                  <span className="sr-only lg:not-sr-only">
                    Gestione squadra
                  </span>
                </Link>
              </Button>
            </div>
          )}

          <NotificationBell />

          <Button
            aria-label="Cambia tema"
            className="relative size-11 rounded-full sm:size-9"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            size="icon"
            variant="ghost"
          >
            <Sun
              aria-hidden="true"
              className="size-5 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90"
            />
            <Moon
              aria-hidden="true"
              className="absolute size-5 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0"
            />
          </Button>

          <Link
            aria-label={displayName}
            className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href={profileLink}
          >
            {profile ? (
              <Avatar
                className={cn(
                  "size-9 transition-transform duration-150 hover:scale-105",
                  isManager
                    ? "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background"
                    : "border",
                )}
              >
                <AvatarImage
                  alt={displayName}
                  className="object-cover"
                  src={profile.avatar_url ?? undefined}
                />
                <AvatarFallback
                  className={cn(
                    "text-xs font-bold",
                    isManager
                      ? "bg-violet-600 text-white"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {profile.nome?.[0]}
                  {profile.cognome?.[0]}
                </AvatarFallback>
              </Avatar>
            ) : (
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full",
                  user ? "bg-emerald-50 text-emerald-700" : "text-primary",
                )}
              >
                <UserCircle aria-hidden="true" className="size-7" />
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  )
}
