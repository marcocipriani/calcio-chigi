"use client"

import { use } from "react"

import { MatchMode } from "@/components/match/MatchMode"

export default function MatchModePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <MatchMode eventId={id} />
}
