"use client"

import { Github } from "lucide-react"

export function AppCredits() {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "v1.0.0";

  return (
    <div className="w-full flex flex-col items-center justify-center py-8 border-t border-border/50 gap-2 mt-8 opacity-60 hover:opacity-100 transition-opacity">
        <p className="text-[11px] text-muted-foreground font-medium">
            Calcio Circolo Chigi <span className="font-mono text-[10px] bg-muted px-1 rounded">{appVersion}</span>
        </p>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            Dev: <span className="font-bold">Marco Cipriani</span>
        </p>
        
        <a 
            href="https://github.com/marcocipriani/calcio-chigi/"
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors bg-muted/30 px-3 py-1 rounded-full border border-transparent hover:border-border"
        >
            <Github className="h-3 w-3" />
            GitHub Repo
        </a>
    </div>
  )
}