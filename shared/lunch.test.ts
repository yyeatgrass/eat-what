import { describe, expect, it } from "vitest";

import {
  calendarInTimeZone,
  chooseLunch,
  elect,
  emptyRoom,
  type Restaurant,
  weekIdFor,
  weekIdInTimeZone,
  weekdayIndex,
  withSyncedWeek,
} from "./lunch";

const places: Restaurant[] = [
  { id: "a", name: "Noodle Room" },
  { id: "b", name: "Corner Tacos" },
  { id: "c", name: "Fig & Rye" },
];

describe("weekday index", () => {
  it("maps Monday through Sunday", () => {
    expect(weekdayIndex("Mon")).toBe(0);
    expect(weekdayIndex("Tue")).toBe(1);
    expect(weekdayIndex("Wed")).toBe(2);
    expect(weekdayIndex("Thu")).toBe(3);
    expect(weekdayIndex("Fri")).toBe(4);
    expect(weekdayIndex("Sat")).toBe(5);
    expect(weekdayIndex("Sun")).toBe(6);
  });

  it("uses the timezone calendar, not the UTC date alone", () => {
    const instant = new Date("2026-09-28T06:30:00.000Z");
    expect(calendarInTimeZone(instant, "UTC")).toMatchObject({
      year: 2026,
      month: 9,
      day: 28,
      weekday: 0,
    });
    expect(calendarInTimeZone(instant, "Pacific/Honolulu")).toMatchObject({
      year: 2026,
      month: 9,
      day: 27,
      weekday: 6,
    });
  });
});

describe("week id", () => {
  it("is the Monday of that timezone's week", () => {
    const instant = new Date("2026-09-28T06:30:00.000Z");
    expect(weekIdInTimeZone(instant, "UTC")).toBe("2026-09-28");
    expect(weekIdInTimeZone(instant, "Pacific/Honolulu")).toBe("2026-09-21");
  });

  it("keeps Saturday in the Monday that opened the week", () => {
    const saturday = new Date("2026-10-03T12:00:00.000Z");
    const calendar = calendarInTimeZone(saturday, "UTC");
    expect(calendar.weekday).toBe(5);
    expect(weekIdFor(calendar)).toBe("2026-09-28");
  });
});

describe("week reset", () => {
  it("clears picks when the week changes and keeps restaurants", () => {
    const stored = {
      timezone: "UTC",
      restaurants: places,
      weekId: "2026-09-21",
      picks: { 0: { restaurantId: "a", name: "Noodle Room" } },
    };
    const next = withSyncedWeek(stored, new Date("2026-10-03T12:00:00.000Z"));
    expect(next.reset).toBe(true);
    expect(next.room.weekId).toBe("2026-09-28");
    expect(next.room.picks).toEqual({});
    expect(next.room.restaurants).toEqual(places);
  });

  it("keeps this week's picks when the week has not changed", () => {
    const stored = {
      timezone: "UTC",
      restaurants: places,
      weekId: "2026-09-28",
      picks: { 0: { restaurantId: "a", name: "Noodle Room" } },
    };
    const next = withSyncedWeek(stored, new Date("2026-10-02T15:00:00.000Z"));
    expect(next.reset).toBe(false);
    expect(next.room.picks).toEqual(stored.picks);
    expect(next.room.restaurants).toEqual(places);
  });
});

describe("election", () => {
  it("excludes restaurants chosen on earlier weekdays only", () => {
    const wednesday = elect({
      restaurants: places,
      picks: {
        0: { restaurantId: "a", name: "Noodle Room" },
        4: { restaurantId: "c", name: "Fig & Rye" },
      },
      weekday: 2,
      reroll: false,
      rng: () => 0,
    });
    expect(wednesday).toMatchObject({
      ok: true,
      restaurant: { id: "b" },
    });
  });

  it("does not invent a pick when every restaurant was used earlier this week", () => {
    expect(
      elect({
        restaurants: places,
        picks: {
          0: { restaurantId: "a", name: "Noodle Room" },
          1: { restaurantId: "b", name: "Corner Tacos" },
          2: { restaurantId: "c", name: "Fig & Rye" },
        },
        weekday: 3,
        reroll: false,
        rng: () => 0,
      }),
    ).toEqual({ ok: false, reason: "exhausted" });
  });

  it("avoids the current pick on a re-roll when another place is eligible", () => {
    for (const rng of [() => 0, () => 0.5, () => 0.999]) {
      const result = elect({
        restaurants: places,
        picks: { 2: { restaurantId: "a", name: "Noodle Room" } },
        weekday: 2,
        reroll: true,
        rng,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.restaurant.id).not.toBe("a");
        expect(result.onlyOption).toBe(false);
      }
    }
  });

  it("allows a re-roll when the current pick is the only option left", () => {
    const only = [{ id: "a", name: "Noodle Room" }];
    const result = elect({
      restaurants: only,
      picks: { 0: { restaurantId: "a", name: "Noodle Room" } },
      weekday: 0,
      reroll: true,
      rng: () => 0.99,
    });
    expect(result).toEqual({
      ok: true,
      restaurant: only[0],
      onlyOption: true,
    });
  });

  it("refuses the weekend", () => {
    expect(
      elect({ restaurants: places, picks: {}, weekday: 5, reroll: false, rng: () => 0 }),
    ).toEqual({ ok: false, reason: "weekend" });
    expect(
      elect({ restaurants: places, picks: {}, weekday: 6, reroll: false, rng: () => 0 }),
    ).toEqual({ ok: false, reason: "weekend" });
  });

  it("refuses an empty list", () => {
    expect(
      elect({ restaurants: [], picks: {}, weekday: 1, reroll: false, rng: () => 0 }),
    ).toEqual({ ok: false, reason: "empty" });
    const room = emptyRoom();
    room.timezone = "UTC";
    room.weekId = "2026-09-28";
    expect(chooseLunch(room, new Date("2026-09-29T15:00:00.000Z"), () => 0)).toEqual({
      ok: false,
      reason: "empty",
    });
  });
});
