import { createClient } from "@supabase/supabase-js"

import { requireLocalSupabaseUrl } from "./local-supabase-url"

const IDS = {
  manager: "91000000-0000-0000-0000-000000000001",
  player: "91000000-0000-0000-0000-000000000002",
  maybe: "91000000-0000-0000-0000-000000000003",
  no: "91000000-0000-0000-0000-000000000004",
  staff: "91000000-0000-0000-0000-000000000005",
  match: "92000000-0000-0000-0000-000000000001",
  training: "92000000-0000-0000-0000-000000000002",
  earlierMatch: "92000000-0000-0000-0000-000000000003",
  communication: "93000000-0000-0000-0000-000000000001",
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
  {
    email: "unassociated@chigi.test",
    password: "Unassociated123!",
    profileId: null,
    nome: null,
    cognome: null,
    isManager: false,
  },
]

export default async function globalSetup() {
  const url = process.env.E2E_SUPABASE_URL
  const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error("Local Supabase E2E environment missing")
  requireLocalSupabaseUrl(url)

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const profileIds = [
    IDS.manager,
    IDS.player,
    IDS.maybe,
    IDS.no,
    IDS.staff,
  ]
  const eventIds = [IDS.match, IDS.training, IDS.earlierMatch]
  const failOnError = (error: { message: string } | null) => {
    if (error) throw error
  }

  const { data: listed, error: listUsersError } =
    await client.auth.admin.listUsers({ perPage: 1000 })
  failOnError(listUsersError)

  failOnError(
    (await client.from("events").delete().in("id", eventIds)).error,
  )
  failOnError(
    (
      await client
        .from("historical_player_stats")
        .delete()
        .in("profile_id", profileIds)
    ).error,
  )
  failOnError(
    (
      await client
        .from("season_memberships")
        .delete()
        .in("profile_id", profileIds)
    ).error,
  )
  failOnError(
    (
      await client
        .from("notifications")
        .delete()
        .eq("actor_profile_id", IDS.manager)
    ).error,
  )
  failOnError(
    (
      await client
        .from("comunicati")
        .delete()
        .eq("id", IDS.communication)
    ).error,
  )

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
  failOnError(
    (
      await client
        .from("account_association_requests")
        .delete()
        .eq(
          "user_id",
          authUsers.get("unassociated@chigi.test") ??
            "00000000-0000-0000-0000-000000000000",
        )
    ).error,
  )

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
      note_mediche: "NON ESPORRE: terapia manager",
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
      note_mediche: "NON ESPORRE: terapia giocatore",
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

  failOnError(
    (
      await client.from("profile_private_details").upsert(
        [
          {
            profile_id: IDS.manager,
            phone: "+39 333 0000001",
            operational_email: "mario.operativo@chigi.test",
          },
          {
            profile_id: IDS.player,
            phone: "+39 333 0000002",
            operational_email: "piero.operativo@chigi.test",
          },
        ],
        { onConflict: "profile_id" },
      )
    ).error,
  )

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
        asi_card_number:
          seasonId === oldSeason.id && profileId === IDS.player
            ? "ASI-E2E-2025"
            : null,
        registration_status:
          seasonId === oldSeason.id && profileId === IDS.player
            ? "ACTIVE"
            : "TODO",
        registration_completed_on:
          seasonId === oldSeason.id && profileId === IDS.player
            ? "2025-09-15"
            : null,
        registration_completed_by:
          seasonId === oldSeason.id && profileId === IDS.player
            ? IDS.manager
            : null,
      }),
    ),
  )
  const { data: memberships, error: membershipError } = await client
    .from("season_memberships")
    .insert(membershipRows)
    .select("id, profile_id, season_id")
  if (membershipError) throw membershipError

  const oldPlayerMembership = memberships.find(
    (row) => row.profile_id === IDS.player && row.season_id === oldSeason.id,
  )
  const currentPlayerMembership = memberships.find(
    (row) => row.profile_id === IDS.player && row.season_id === season.id,
  )
  if (!oldPlayerMembership || !currentPlayerMembership) {
    throw new Error("Player memberships missing")
  }
  const { error: paymentError } = await client.from("payments").insert([
    {
      membership_id: oldPlayerMembership.id,
      description: "Quota stagione",
      amount_due: 80,
      due_on: "2026-07-31",
      status: "DUE",
      created_by: IDS.manager,
    },
    {
      membership_id: currentPlayerMembership.id,
      description: "Quota stagione",
      amount_due: 80,
      due_on: "2026-08-31",
      status: "DUE",
      created_by: IDS.manager,
    },
  ])
  failOnError(paymentError)

  const { error: certificateError } = await client
    .from("medical_certificates")
    .insert([
      {
        membership_id: oldPlayerMembership.id,
        document_path: `${IDS.player}/certificato-e2e-2025.pdf`,
        competitive_declared: true,
        visit_on: "2025-09-01",
        expires_on: "2026-09-01",
        laboratory: "Centro Medico E2E",
        status: "VALID",
        verified_by: IDS.manager,
        verified_at: "2025-09-02T10:00:00Z",
        updated_by: IDS.manager,
      },
      {
        membership_id: currentPlayerMembership.id,
        document_path: `${IDS.player}/certificato-e2e-2026.pdf`,
        competitive_declared: true,
        visit_on: "2026-07-20",
        expires_on: "2027-07-20",
        laboratory: "Centro Medico E2E",
        status: "VALID",
        verified_by: IDS.manager,
        verified_at: "2026-07-21T10:00:00Z",
        updated_by: IDS.manager,
      },
    ])
  failOnError(certificateError)

  const { data: seededTeam, error: seededTeamError } = await client
    .from("teams")
    .select("id")
    .eq("slug", "psicologol")
    .maybeSingle()
  failOnError(seededTeamError)
  failOnError(
    (
      seededTeam
        ? await client
            .from("teams")
            .update({
              nome: "PSICOLOGOL",
              logo_url: "/teams/psicologi.png",
            })
            .eq("id", seededTeam.id)
        : await client
            .from("teams")
            .insert({
              nome: "PSICOLOGOL",
              slug: "psicologol",
              logo_url: "/teams/psicologi.png",
            })
    ).error,
  )
  failOnError(
    (
      await client.from("comunicati").insert({
        id: IDS.communication,
        enjore_url: "https://example.test/comunicato-e2e",
        titolo: "Comunicato E2E",
        data: "2026-07-20",
      })
    ).error,
  )

  const { error: eventsError } = await client.from("events").insert([
    {
      id: IDS.training,
      season_id: oldSeason.id,
      tipo: "ALLENAMENTO",
      data_ora: "2026-07-28T19:30:00+02:00",
      luogo: "Campo Circolo Chigi",
      cancellato: false,
      giocata: false,
    },
    {
      id: IDS.match,
      season_id: oldSeason.id,
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
      fase: "FASE_1",
      giornata: 1,
    },
    {
      id: IDS.earlierMatch,
      season_id: oldSeason.id,
      tipo: "PARTITA",
      data_ora: "2026-07-25T21:15:00+02:00",
      luogo: "Campo Circolo Chigi",
      squadra_casa: "PSICOLOGOL",
      squadra_ospite: "CIRC. CHIGI",
      avversario: "PSICOLOGOL",
      cancellato: false,
      giocata: true,
      gol_casa: 0,
      gol_ospite: 2,
      fase: "FASE_1",
      giornata: 2,
    },
  ])
  if (eventsError) throw eventsError

  failOnError((await client.from("event_checkins").insert([
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
  ])).error)
  failOnError((await client.from("match_player_stats").insert({
    event_id: IDS.match,
    profile_id: IDS.player,
    goals: 2,
    assists: 1,
    yellow_cards: 1,
    red_cards: 0,
    updated_by: IDS.manager,
  })).error)
  failOnError((await client.from("match_awards").insert({
    event_id: IDS.match,
    profile_id: IDS.player,
    updated_by: IDS.manager,
  })).error)
  failOnError(
    (
      await client.from("historical_player_stats").insert([
        {
          season_id: oldSeason.id,
          phase_key: "FASE_1",
          profile_id: IDS.player,
          goals: 6,
          mvp: 2,
          yellow_cards: 3,
          red_cards: 1,
          source_url: "https://history.test/e2e",
        },
        {
          season_id: oldSeason.id,
          phase_key: "FASE_2_PROFESSIONISTI",
          profile_id: IDS.player,
          goals: 4,
          mvp: 1,
          yellow_cards: 1,
          red_cards: 0,
          source_url: "https://history.test/e2e",
        },
      ])
    ).error,
  )
}
