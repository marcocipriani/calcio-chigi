"use client"

import { useDeferredValue, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, FileDown, Search } from "lucide-react"

import { PageContainer } from "@/components/layout/PageContainer"
import { PageTitleBar } from "@/components/layout/PageTitleBar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  REGOLAMENTO_PDF,
  REGOLAMENTO_SECTIONS,
  type RegolamentoSection,
} from "@/lib/regolamento"

// NFD + rimozione accenti mantiene la lunghezza del testo NFC: gli indici dei match valgono sull'originale.
const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const parts: ReactNode[] = []
  const haystack = fold(text)
  let from = 0
  for (let at = haystack.indexOf(query); at !== -1; at = haystack.indexOf(query, from)) {
    parts.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + query.length)}</mark>)
    from = at + query.length
  }
  parts.push(text.slice(from))
  return parts
}

function Block({ text, query }: { text: string; query: string }) {
  if (text.startsWith("## ")) {
    return (
      <h3 className="pt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {highlight(text.slice(3), query)}
      </h3>
    )
  }
  if (text.startsWith("- ")) {
    return (
      <p className="relative pl-4 before:absolute before:left-0 before:content-['•']">
        {highlight(text.slice(2), query)}
      </p>
    )
  }
  return <p>{highlight(text, query)}</p>
}

function Index({ sections }: { sections: RegolamentoSection[] }) {
  return (
    <ol className="space-y-0.5 text-sm">
      {sections.map((section) => (
        <li key={section.id}>
          <a
            className="flex gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
            href={`#${section.id}`}
          >
            <span className="w-12 shrink-0 font-bold text-primary">{section.label}</span>
            <span className="min-w-0">{section.title}</span>
          </a>
        </li>
      ))}
    </ol>
  )
}

export default function RegolamentoPage() {
  const [search, setSearch] = useState("")
  const query = fold(useDeferredValue(search).trim())

  const sections = useMemo(() => {
    if (query.length < 2) return REGOLAMENTO_SECTIONS
    return REGOLAMENTO_SECTIONS.flatMap((section) => {
      if (fold(`${section.label} ${section.title}`).includes(query)) return [section]
      // Ogni risultato porta con sé il sottotitolo a cui appartiene.
      const blocks: string[] = []
      let heading: string | undefined
      for (const block of section.blocks) {
        if (block.startsWith("## ")) heading = block
        if (!fold(block).includes(query)) continue
        if (heading && !blocks.includes(heading)) blocks.push(heading)
        if (block !== heading) blocks.push(block)
      }
      return blocks.length ? [{ ...section, blocks }] : []
    })
  }, [query])
  const activeQuery = query.length < 2 ? "" : query

  return (
    <PageContainer contentClassName="mx-auto max-w-5xl space-y-4 pb-24">
      <Button asChild size="sm" variant="ghost">
        <Link href="/torneo">
          <ArrowLeft aria-hidden="true" />
          Torneo
        </Link>
      </Button>

      <PageTitleBar
        actions={
          <Button asChild variant="outline">
            <a href={REGOLAMENTO_PDF} rel="noopener noreferrer" target="_blank">
              <FileDown aria-hidden="true" />
              PDF
            </a>
          </Button>
        }
        subtitle="Campionato ASI Over35 2026/27"
        title="Regolamento"
      />

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Cerca nel regolamento"
          className="h-11 pl-9"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca (es. fuoriquota, distinta, VAR)"
          type="search"
          value={search}
        />
      </div>

      <div className="gap-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Indice" className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto">
            <Index sections={sections} />
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
          <details
            className="rounded-xl border bg-card lg:hidden"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) event.currentTarget.open = false
            }}
          >
            <summary className="cursor-pointer px-4 py-3 font-bold">
              Indice ({sections.length})
            </summary>
            <nav aria-label="Indice" className="px-2 pb-2">
              <Index sections={sections} />
            </nav>
          </details>

          {activeQuery && (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {sections.length
                ? `${sections.length} sezioni contengono “${search.trim()}”.`
                : `Nessun risultato per “${search.trim()}”.`}
            </p>
          )}

          {sections.map((section) => (
            <section
              className="scroll-mt-20 space-y-2 rounded-xl border bg-card p-4 text-sm leading-relaxed sm:p-5"
              id={section.id}
              key={section.id}
            >
              <h2 className="text-lg font-black leading-tight">
                <span className="text-primary">{section.label}</span>{" "}
                {highlight(section.title, activeQuery)}
              </h2>
              {section.blocks.map((block, index) => (
                <Block key={index} query={activeQuery} text={block} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </PageContainer>
  )
}
