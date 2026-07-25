import { differenceInYears, format, subMinutes } from "date-fns"
import { it } from "date-fns/locale"

type FormationEvent = {
  data_ora: string | null
  luogo?: string | null
  squadra_casa?: string | null
  squadra_ospite?: string | null
  avversario?: string | null
}

type FormationMessagePlayer = {
  nome: string
  cognome: string
  role?: string | null
  birthDate?: string | null
  isStarter: boolean
}

function opponent(event: FormationEvent) {
  if (event.avversario) return event.avversario
  return event.squadra_casa?.toLocaleLowerCase("it").includes("chigi")
    ? event.squadra_ospite
    : event.squadra_casa
}

function playerLine(
  player: FormationMessagePlayer,
  matchDate: Date,
) {
  const badges: string[] = []
  if (player.role === "PORTIERE") badges.push("PORTIERE")
  if (
    player.birthDate &&
    differenceInYears(matchDate, new Date(player.birthDate)) < 35
  ) {
    badges.push("UNDER")
  }
  return `${player.nome} ${player.cognome}${
    badges.length ? ` [${badges.join(" · ")}]` : ""
  }`
}

export function buildOfficialFormationMessage(
  event: FormationEvent,
  players: FormationMessagePlayer[],
) {
  if (!event.data_ora) return "Partita senza data."

  const matchDate = new Date(event.data_ora)
  const meetingDate = subMinutes(matchDate, 45)
  const starters = players.filter(({ isStarter }) => isStarter)
  const bench = players.filter(({ isStarter }) => !isStarter)
  const lines = (group: FormationMessagePlayer[]) =>
    group.length
      ? group.map((player) => playerLine(player, matchDate)).join("\n")
      : "Da definire"

  return `⚽ INFO PARTITA per ${format(matchDate, "EEEE d MMMM", {
    locale: it,
  })} vs ${opponent(event) ?? "avversario da definire"}

📍 DOVE E QUANDO:
Ritrovo ore ${format(meetingDate, "HH:mm")} – ${event.luogo ?? "campo da definire"}
Calcio d’inizio ore ${format(matchDate, "HH:mm")}

🔴⚪️ DIVISA:
Portate entrambe le divise complete (maglia, pantaloncino, calze) per sicurezza

🟢 TITOLARI:
${lines(starters)}

🪑 PANCHINA:
${lines(bench)}

Ci vediamo al campo! 💪`
}
