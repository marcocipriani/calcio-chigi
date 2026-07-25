import { createClient } from "@supabase/supabase-js"

const IDS = {
  manager: "91000000-0000-0000-0000-000000000001",
  player: "91000000-0000-0000-0000-000000000002",
  maybe: "91000000-0000-0000-0000-000000000003",
  no: "91000000-0000-0000-0000-000000000004",
  staff: "91000000-0000-0000-0000-000000000005",
  match: "92000000-0000-0000-0000-000000000001",
  training: "92000000-0000-0000-0000-000000000002",
}

const accounts = [
  {
    email: "manager@chigi.test",
    password: "Manager123!",
    profileId: IDS.manager,
    nome: "Mario",
    cognome: "Manager",
    isManager: true,
  },
  {
    email: "player@chigi.test",
    password: "Player123!",
    profileId: IDS.player,
    nome: "Piero",
    cognome: "Player",
    isManager: false,
  },
]

export default async function globalSetup() {
  const url = process.env.E2E_SUPABASE_URL
  const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error("Local Supabase E2E environment missing")

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: listed } = await client.auth.admin.listUsers({ perPage: 1000 })

  await client
    .from("season_memberships")
    .delete()
    .in("profile_id", Object.values(IDS).slice(0, 5))
  await client.from("events").delete().in("id", [IDS.match, IDS.training])

  const authUsers = new Map<string, string>()
  for (const account of accounts) {
    const existing = listed.users.find((user) => user.email === account.email)
    if (existing) {
      const { error } = await client.auth.admin.updateUserById(existing.id, {
        password: account.password,
        email_confirm: true,
      })
      if (error) throw error
      authUsers.set(account.email, existing.id)
    } else {
      const { data, error } = await client.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
      })
      if (error || !data.user) throw error ?? new Error(`Cannot seed ${account.email}`)
      authUsers.set(account.email, data.user.id)
    }
  }

  const { error: profilesError } = await client.from("profiles").upsert([
    {
      id: IDS.manager,
      user_id: authUsers.get("manager@chigi.test"),
      nome: "Mario",
      cognome: "Manager",
      email: "manager@chigi.test",
      ruolo: "DIFENSORE",
      numero_maglia: 4,
      is_manager: true,
      is_staff: false,
      note_mediche: "OK",
    },
    {
      id: IDS.player,
      user_id: authUsers.get("player@chigi.test"),
      nome: "Piero",
      cognome: "Player",
      email: "player@chigi.test",
      ruolo: "ATTACCANTE",
      numero_maglia: 9,
      is_manager: false,
      is_staff: false,
      note_mediche: "OK",
    },
    {
      id: IDS.maybe,
      nome: "Marco",
      cognome: "Forse",
      ruolo: "PORTIERE",
      numero_maglia: 1,
      is_manager: false,
      is_staff: false,
      note_mediche: "OK",
    },
    {
      id: IDS.no,
      nome: "Nino",
      cognome: "Escluso",
      ruolo: "CENTROCAMPISTA",
      numero_maglia: 8,
      is_manager: false,
      is_staff: false,
      note_mediche: "OK",
    },
    {
      id: IDS.staff,
      nome: "Sara",
      cognome: "Massaggiatrice",
      is_manager: false,
      is_staff: true,
      note_mediche: "OK",
    },
  ], { onConflict: "id" })
  if (profilesError) throw profilesError

  await client.from("profile_private_details").upsert([
    { profile_id: IDS.manager, phone: "+39 333 0000001" },
    { profile_id: IDS.player, phone: "+39 333 0000002" },
  ], { onConflict: "profile_id" })

  const { data: season, error: seasonError } = await client
    .from("seasons")
    .select("id")
    .eq("slug", "2026-2027")
    .single()
  if (seasonError) throw seasonError
  const { data: oldSeason, error: oldSeasonError } = await client
    .from("seasons")
    .select("id")
    .eq("slug", "2025-2026")
    .single()
  if (oldSeasonError) throw oldSeasonError

  const membershipPeople = [
    [IDS.manager, "PLAYER", "DIFENSORE", null, 4, "YES"],
    [IDS.player, "PLAYER", "ATTACCANTE", null, 9, "YES"],
    [IDS.maybe, "PLAYER", "PORTIERE", null, 1, "MAYBE"],
    [IDS.no, "PLAYER", "CENTROCAMPISTA", null, 8, "NO"],
    [IDS.staff, "STAFF", null, "Massaggiatrice", null, "YES"],
  ]
  const membershipRows = [oldSeason.id, season.id].flatMap((seasonId) =>
    membershipPeople.map(
      ([profileId, category, role, staffFunction, jerseyNumber, status]) => ({
        profile_id: profileId,
        season_id: seasonId,
        category,
        role,
        staff_function: staffFunction,
        jersey_number: jerseyNumber,
        status,
      }),
    ),
  )
  const { data: memberships, error: membershipError } = await client
    .from("season_memberships")
    .insert(membershipRows)
    .select("id, profile_id, season_id")
  if (membershipError) throw membershipError

  const playerMembership = memberships.find(
    (row) => row.profile_id === IDS.player && row.season_id === season.id,
  )
  if (!playerMembership) throw new Error("Player membership missing")
  await client.from("payments").insert({
    membership_id: playerMembership.id,
    description: "Quota stagione",
    amount_due: 80,
    due_on: "2026-08-31",
    status: "DUE",
    created_by: IDS.manager,
  })

  await client.from("teams").upsert(
    { nome: "PSICOLOGOL", slug: "psicologol" },
    { onConflict: "slug" },
  )

  const { error: eventsError } = await client.from("events").insert([
    {
      id: IDS.training,
      season_id: oldSeason?.id,
      tipo: "ALLENAMENTO",
      data_ora: "2026-07-28T19:30:00+02:00",
      luogo: "Campo Circolo Chigi",
      cancellato: false,
      giocata: false,
    },
    {
      id: IDS.match,
      season_id: oldSeason?.id,
      tipo: "PARTITA",
      data_ora: "2026-07-30T21:15:00+02:00",
      luogo: "Vigor Perconti",
      squadra_casa: "CIRC. CHIGI",
      squadra_ospite: "PSICOLOGOL",
      avversario: "PSICOLOGOL",
      cancellato: false,
      giocata: true,
      gol_casa: 3,
      gol_ospite: 1,
    },
  ])
  if (eventsError) throw eventsError

  await client.from("event_checkins").insert([
    {
      event_id: IDS.training,
      profile_id: IDS.player,
      status: "PRESENT",
      checked_in_by: IDS.manager,
    },
    {
      event_id: IDS.match,
      profile_id: IDS.player,
      status: "PRESENT",
      checked_in_by: IDS.manager,
    },
  ])
  await client.from("match_player_stats").insert({
    event_id: IDS.match,
    profile_id: IDS.player,
    goals: 2,
    assists: 1,
    updated_by: IDS.manager,
  })
  await client.from("match_awards").insert({
    event_id: IDS.match,
    profile_id: IDS.player,
    updated_by: IDS.manager,
  })
}
