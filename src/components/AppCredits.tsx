"use client"

import { Github } from "lucide-react"

interface AppCreditsProps {
  uid?: string;
}

export function AppCredits({ uid }: AppCreditsProps) {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "v1.0.1";

  return (
    <div className="w-full flex flex-col items-center justify-center py-8 border-t border-border/50 gap-3 mt-8 opacity-60 hover:opacity-100 transition-opacity">
        
        {uid && (
            <code className="text-[11px] text-muted-foreground/30 font-mono select-all bg-muted/30 px-2 py-1 rounded">
                UID: {uid}
            </code>
        )}

        <div className="flex flex-col items-center gap-1">
            <p className="text-[11px] text-muted-foreground font-medium">
                Calcio Circolo Chigi <span className="font-mono text-[10px] bg-muted px-1 rounded">{appVersion}</span>
            </p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                Dev: <span className="font-bold">Marco Cipriani</span>
            </p>
        </div>
        
        <a 
            href="https://github.com/marcocipriani/calcio-chigi"
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors bg-muted/30 px-3 py-1 rounded-full border border-transparent hover:border-border"
        >
            <Github className="h-3 w-3" />
            GitHub Repo
        </a>
    </div>
  )
}