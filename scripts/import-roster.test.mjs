import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildImportPlan,
  buildGlobalPatch,
  mapDepartmentFlags,
  mapExcelMembership,
  normalizePersonKey,
} from "./import-roster.mjs"

describe("normalizePersonKey", () => {
  it("normalizes accents, apostrophes and whitespace", () => {
    assert.equal(normalizePersonKey("  Michele ", "D’Oria"), "michele d oria")
    assert.equal(normalizePersonKey("Elio", "Dorbolò"), "elio dorbolo")
  })
})

describe("mapDepartmentFlags", () => {
  it("keeps EXT and AGG as separate flags", () => {
    assert.deepEqual(mapDepartmentFlags("EXT"), {
      is_external: true,
      is_aggregated: false,
      department: null,
    })
    assert.deepEqual(mapDepartmentFlags("AGG"), {
      is_external: false,
      is_aggregated: true,
      department: null,
    })
  })

  it("maps organizational tags to department", () => {
    assert.deepEqual(mapDepartmentFlags("DPC"), {
      is_external: false,
      is_aggregated: false,
      department: "DPC",
    })
  })
})

describe("mapExcelMembership", () => {
  it("maps explicit final responses", () => {
    assert.equal(
      mapExcelMembership({ adhesion: "OK", note: "", excelOnly: true }).status,
      "YES",
    )
    assert.equal(
      mapExcelMembership({
        adhesion: "",
        note: "IN FORSE",
        excelOnly: true,
      }).status,
      "MAYBE",
    )
    assert.equal(
      mapExcelMembership({
        adhesion: "NO - ALTRI TORNEI",
        note: "",
        excelOnly: true,
      }).status,
      "NO",
    )
  })

  it("keeps existing profiles pending without a final response", () => {
    assert.equal(
      mapExcelMembership({
        adhesion: "LO SENTE ELIO",
        note: "",
        excelOnly: false,
      }).status,
      "PENDING",
    )
  })

  it("maps Excel-only contacts to interested", () => {
    assert.equal(
      mapExcelMembership({
        adhesion: "CHIESTO",
        note: "DA RISENTIRE",
        excelOnly: true,
      }).status,
      "INTERESTED",
    )
  })

  it("keeps training-only interested and out of match formations", () => {
    assert.deepEqual(
      mapExcelMembership({
        adhesion: "-",
        note: "SOLO ALLENAMENTI",
        excelOnly: true,
      }),
      {
        status: "INTERESTED",
        category: "PLAYER",
        training_only: true,
      },
    )
  })

  it("maps dirigente to seasonal staff", () => {
    assert.deepEqual(
      mapExcelMembership({
        adhesion: "",
        note: "DIRIGENTE",
        excelOnly: true,
      }),
      {
        status: "INTERESTED",
        category: "STAFF",
        training_only: false,
      },
    )
  })
})

describe("buildGlobalPatch", () => {
  it("keeps populated database fields and fills missing values from Excel", () => {
    assert.deepEqual(
      buildGlobalPatch(
        {
          nome: "Michele",
          cognome: "D'Oria",
          data_nascita: "1989-03-11",
          avatar_url: "https://example.test/avatar.jpg",
        },
        {
          nome: "Michele",
          cognome: "D’Oria",
          data_nascita: "1989-03-12",
        },
      ),
      {
        nome: "Michele",
        cognome: "D'Oria",
        data_nascita: "1989-03-11",
        avatar_url: "https://example.test/avatar.jpg",
      },
    )
  })
})

describe("buildImportPlan", () => {
  it("keeps Elio Dorbolò in the player roster even when legacy notes say dirigente", () => {
    const plan = buildImportPlan(
      [{
        rowNumber: 4,
        nome: "Elio",
        cognome: "Dorbolò",
        adhesion: "OK",
        note: "DIRIGENTE",
      }],
      [{
        id: "dorbolo",
        nome: "Elio",
        cognome: "Dorbolò",
        ruolo: "CENTROCAMPISTA",
        is_staff: true,
      }],
    )

    assert.deepEqual(
      {
        category: plan.people[0].membership.category,
        role: plan.people[0].membership.role,
        staff_function: plan.people[0].membership.staff_function,
      },
      {
        category: "PLAYER",
        role: "CENTROCAMPISTA",
        staff_function: null,
      },
    )
  })

  it("classifies Maria Carla Menichini as presidente", () => {
    const plan = buildImportPlan(
      [{
        rowNumber: 5,
        nome: "Maria Carla",
        cognome: "Menichini",
        adhesion: "OK",
        note: "",
      }],
      [{
        id: "menichini",
        nome: "Maria Carla",
        cognome: "Menichini",
        ruolo: null,
        is_staff: false,
      }],
    )

    assert.deepEqual(
      {
        category: plan.people[0].membership.category,
        role: plan.people[0].membership.role,
        staff_function: plan.people[0].membership.staff_function,
      },
      {
        category: "STAFF",
        role: null,
        staff_function: "Presidente",
      },
    )
  })
})
