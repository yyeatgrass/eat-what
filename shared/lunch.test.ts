import { describe, expect, it } from "vitest";

import {
  calendarInTimeZone,
  advanceDebugDay,
  addRestaurant,
  chooseLunch,
  choosePastDay,
  chooseRestaurant,
  confirmPastDay,
  confirmToday,
  elect,
  emptyRoom,
  prepareRoom,
  removeFromToday,
  removeRestaurant,
  toPublicState,
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

  it("opens a Saturday kitchen by standing in as Friday", () => {
    const room = {
      ...emptyRoom(),
      timezone: "UTC",
      weekId: "2026-09-28",
      debugKitchen: true,
      restaurants: places,
    };
    const saturday = new Date("2026-10-03T12:00:00.000Z");
    const state = toPublicState(room, saturday);
    expect(state.phase).toBe("ready");
    expect(state.debugStandIn).toBe(true);
    expect(state.weekdayName).toBe("星期五");
    expect(state.dateLabel).toBe("2026年10月2日 星期五");
    expect(state.realWeekdayName).toBe("星期六");
    expect(state.weekId).toBe("2026-09-28");

    const sunday = new Date("2026-10-04T12:00:00.000Z");
    expect(toPublicState(room, sunday).dateLabel).toBe("2026年10月2日 星期五");

    const chosen = chooseLunch(room, saturday, () => 0);
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.room.picks[4]?.name).toBe("Noodle Room");
  });

  it("steps to the next day and clears picks when Monday starts", () => {
    const saturday = new Date("2026-10-03T12:00:00.000Z");
    const friday = {
      ...emptyRoom(),
      timezone: "UTC",
      weekId: "2026-09-28",
      debugKitchen: true,
      restaurants: places,
      picks: { 4: { restaurantId: "a", name: "Noodle Room" } },
    };

    const onSaturday = advanceDebugDay(friday, saturday);
    expect(onSaturday.debugDate).toEqual({ year: 2026, month: 10, day: 3 });
    expect(toPublicState(onSaturday, saturday)).toMatchObject({
      phase: "weekend",
      weekdayName: "星期六",
      dateLabel: "2026年10月3日 星期六",
      weekId: "2026-09-28",
      debugPinned: true,
    });
    expect(onSaturday.picks[4]?.name).toBe("Noodle Room");

    const onSunday = advanceDebugDay(onSaturday, saturday);
    expect(toPublicState(onSunday, saturday).weekdayName).toBe("星期日");

    const onMonday = advanceDebugDay(onSunday, saturday);
    const monday = toPublicState(onMonday, saturday);
    expect(monday.weekdayName).toBe("星期一");
    expect(monday.dateLabel).toBe("2026年10月5日 星期一");
    expect(monday.weekId).toBe("2026-10-05");
    expect(monday.phase).toBe("ready");
    expect(monday.picks).toEqual([]);
    expect(onMonday.restaurants).toEqual(places);

    const chosen = chooseLunch(onMonday, saturday, () => 0);
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.room.picks[0]?.name).toBe("Noodle Room");
  });

  it("keeps Saturday closed when the debug kitchen is off", () => {
    const room = {
      ...emptyRoom(),
      timezone: "UTC",
      weekId: "2026-09-28",
      restaurants: places,
    };
    const saturday = new Date("2026-10-03T12:00:00.000Z");
    expect(toPublicState(room, saturday).phase).toBe("weekend");
    expect(chooseLunch(room, saturday, () => 0)).toEqual({ ok: false, reason: "weekend" });
  });

  it("refuses the weekend", () => {
    expect(
      elect({ restaurants: places, picks: {}, weekday: 5, reroll: false, rng: () => 0 }),
    ).toEqual({ ok: false, reason: "weekend" });
    expect(
      elect({ restaurants: places, picks: {}, weekday: 6, reroll: false, rng: () => 0 }),
    ).toEqual({ ok: false, reason: "weekend" });
  });

  it("clones today's list from restaurants not already chosen, then keeps removals", () => {
    const wednesday = new Date("2026-09-30T04:00:00.000Z");
    const base = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
        picks: { 0: { restaurantId: "a", name: "Noodle Room" } },
      },
      wednesday,
    ).room;
    expect(base.todayList?.ids).toEqual(["b", "c"]);

    const trimmed = removeFromToday(base, "b");
    expect(trimmed.restaurants).toEqual(places);
    expect(trimmed.todayList?.ids).toEqual(["c"]);
    expect(removeFromToday(trimmed, "b")).toBe(trimmed);

    const again = prepareRoom(trimmed, wednesday).room;
    expect(again.todayList?.ids).toEqual(["c"]);

    const addedResult = addRestaurant(again, "Basil Bowl", "d");
    expect(addedResult.ok).toBe(true);
    if (!addedResult.ok) return;
    const added = prepareRoom(addedResult.room, wednesday).room;
    expect(added.todayList?.ids).toEqual(["c", "d"]);
    expect(added.restaurants.map((restaurant) => restaurant.id)).toEqual(["a", "b", "c", "d"]);

    const thursday = prepareRoom(
      {
        ...added,
        debugKitchen: true,
        debugDate: { year: 2026, month: 10, day: 1 },
      },
      wednesday,
    ).room;
    expect(thursday.todayList?.weekday).toBe(3);
    expect(thursday.todayList?.ids).toEqual(["b", "c", "d"]);
  });

  it("draws a restaurant that was just added to an open day", () => {
    const wednesday = new Date("2026-09-30T04:00:00.000Z");
    const room = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
      },
      wednesday,
    ).room;
    const added = addRestaurant(room, "Basil Bowl", "d");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const ready = prepareRoom(added.room, wednesday).room;
    expect(ready.todayList?.ids).toEqual(["a", "b", "c", "d"]);
    const chosen = chooseLunch(ready, wednesday, () => 0.99);
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.room.picks[2]?.name).toBe("Basil Bowl");
  });

  it("leaves a confirmed day locked when a restaurant is added", () => {
    const wednesday = new Date("2026-09-30T04:00:00.000Z");
    const room = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
      },
      wednesday,
    ).room;
    const chosen = chooseLunch(room, wednesday, () => 0);
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    const confirmed = confirmToday(chosen.room, wednesday);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const added = addRestaurant(confirmed.room, "Basil Bowl", "d");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const ready = prepareRoom(added.room, wednesday).room;
    expect(ready.restaurants.map((restaurant) => restaurant.name)).toContain("Basil Bowl");
    expect(ready.todayList?.ids).toEqual(["a", "b", "c"]);
    expect(chooseLunch(ready, wednesday, () => 0.99)).toEqual({
      ok: false,
      reason: "confirmed",
    });

    const thursday = prepareRoom(
      {
        ...ready,
        debugKitchen: true,
        debugDate: { year: 2026, month: 10, day: 1 },
      },
      wednesday,
    ).room;
    expect(thursday.todayList?.ids).toEqual(["b", "c", "d"]);
  });

  it("keeps a weekend addition on the whole list until Monday copies it", () => {
    const saturday = new Date("2026-10-03T12:00:00.000Z");
    const room = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
      },
      saturday,
    ).room;
    expect(room.todayList).toBeNull();
    const added = addRestaurant(room, "Basil Bowl", "d");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const ready = prepareRoom(added.room, saturday).room;
    expect(ready.todayList).toBeNull();
    expect(ready.restaurants.map((restaurant) => restaurant.id)).toEqual(["a", "b", "c", "d"]);

    const monday = prepareRoom(
      {
        ...ready,
        debugKitchen: true,
        debugDate: { year: 2026, month: 10, day: 5 },
      },
      saturday,
    ).room;
    expect(monday.todayList?.weekday).toBe(0);
    expect(monday.todayList?.ids).toEqual(["a", "b", "c", "d"]);
  });

  it("draws only from today's list and clears that pick if the place is removed", () => {
    const wednesday = new Date("2026-09-30T04:00:00.000Z");
    const room = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
      },
      wednesday,
    ).room;
    const trimmed = removeFromToday(removeFromToday(room, "a"), "b");
    const chosen = chooseLunch(trimmed, wednesday, () => 0.99);
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.room.picks[2]?.name).toBe("Fig & Rye");
    expect(chosen.onlyOption).toBe(true);

    const cleared = removeFromToday(chosen.room, "c");
    expect(cleared.picks[2]).toBeUndefined();
    expect(toPublicState(cleared, wednesday).phase).toBe("today-empty");
    expect(chooseLunch(cleared, wednesday, () => 0)).toEqual({
      ok: false,
      reason: "today-empty",
    });
  });

  it("removing a restaurant from the whole list also drops it from today", () => {
    const wednesday = new Date("2026-09-30T04:00:00.000Z");
    const room = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
      },
      wednesday,
    ).room;
    const next = removeRestaurant(room, "b");
    expect(next.todayList?.ids).toEqual(["a", "c"]);
    expect(next.restaurants.map((restaurant) => restaurant.id)).toEqual(["a", "c"]);
  });

  it("locks today's choice after it is confirmed", () => {
    const wednesday = new Date("2026-09-30T04:00:00.000Z");
    const room = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
      },
      wednesday,
    ).room;
    const chosen = chooseLunch(room, wednesday, () => 0);
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.room.picks[2]?.confirmed).toBe(false);
    expect(confirmToday(chosen.room, new Date("2026-10-03T12:00:00.000Z"))).toEqual({
      ok: false,
      reason: "weekend",
    });

    const confirmed = confirmToday(chosen.room, wednesday);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.room.picks[2]).toMatchObject({
      restaurantId: "a",
      name: "Noodle Room",
      confirmed: true,
    });
    expect(toPublicState(confirmed.room, wednesday).todayPick).toMatchObject({
      name: "Noodle Room",
      confirmed: true,
    });
    expect(chooseLunch(confirmed.room, wednesday, () => 0.99)).toEqual({
      ok: false,
      reason: "confirmed",
    });
    expect(removeFromToday(confirmed.room, "a")).toBe(confirmed.room);
    expect(removeRestaurant(confirmed.room, "a")).toBe(confirmed.room);
    expect(removeFromToday(confirmed.room, "b").todayList?.ids).toEqual(["a", "c"]);

    const again = confirmToday(confirmed.room, wednesday);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.room.picks[2]?.confirmed).toBe(true);

    const thursday = prepareRoom(
      {
        ...confirmed.room,
        debugKitchen: true,
        debugDate: { year: 2026, month: 10, day: 1 },
      },
      wednesday,
    ).room;
    expect(thursday.picks[2]?.confirmed).toBe(true);
    expect(toPublicState(thursday, wednesday).todayPick).toBeNull();
    const next = chooseLunch(thursday, wednesday, () => 0);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.room.picks[3]?.confirmed).toBe(false);
    expect(next.room.picks[3]?.name).not.toBe("Noodle Room");
  });

  it("refuses to confirm a day that has no pick", () => {
    const wednesday = new Date("2026-09-30T04:00:00.000Z");
    const room = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
      },
      wednesday,
    ).room;
    expect(confirmToday(room, wednesday)).toEqual({ ok: false, reason: "no-pick" });
  });

  it("lets the table choose a place still on today's list", () => {
    const wednesday = new Date("2026-09-30T04:00:00.000Z");
    const room = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
        picks: { 0: { restaurantId: "a", name: "Noodle Room" } },
      },
      wednesday,
    ).room;
    const removed = removeFromToday(room, "b");
    expect(chooseRestaurant(removed, wednesday, "a")).toEqual({
      ok: false,
      reason: "not-today",
    });
    expect(chooseRestaurant(removed, wednesday, "b")).toEqual({
      ok: false,
      reason: "not-today",
    });
    const chosen = chooseRestaurant(removed, wednesday, "c");
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.room.picks[2]).toMatchObject({
      restaurantId: "c",
      name: "Fig & Rye",
      confirmed: false,
    });

    expect(chooseRestaurant(chosen.room, wednesday, "c").ok).toBe(true);
    const added = addRestaurant(chosen.room, "Basil Bowl", "d");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const manual = chooseRestaurant(added.room, wednesday, "d");
    expect(manual.ok).toBe(true);
    if (!manual.ok) return;
    expect(manual.room.picks[2]?.name).toBe("Basil Bowl");
    expect(manual.room.picks[2]?.confirmed).toBe(false);

    const confirmed = confirmToday(manual.room, wednesday);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(chooseRestaurant(confirmed.room, wednesday, "c")).toEqual({
      ok: false,
      reason: "confirmed",
    });
    expect(confirmed.room.picks[2]?.name).toBe("Basil Bowl");

    const cleared = removeFromToday(removeFromToday(room, "b"), "c");
    expect(chooseRestaurant(cleared, wednesday, "c")).toEqual({
      ok: false,
      reason: "today-empty",
    });
  });

  it("reopens an unconfirmed past day and can leave it empty", () => {
    const thursday = new Date("2026-10-01T04:00:00.000Z");
    const room = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
        picks: {
          0: { restaurantId: "a", name: "Noodle Room", confirmed: true },
          2: { restaurantId: "c", name: "Fig & Rye", confirmed: false },
        },
      },
      thursday,
    ).room;

    expect(choosePastDay(room, thursday, 0, "b")).toEqual({ ok: false, reason: "confirmed" });
    expect(choosePastDay(room, thursday, 3, null)).toEqual({ ok: false, reason: "not-past" });
    expect(choosePastDay(room, thursday, 4, null)).toEqual({ ok: false, reason: "not-past" });
    expect(choosePastDay(room, thursday, 2, "a")).toEqual({ ok: false, reason: "taken" });

    const emptied = choosePastDay(room, thursday, 2, null);
    expect(emptied.ok).toBe(true);
    if (!emptied.ok) return;
    expect(emptied.room.picks[2]).toMatchObject({ empty: true, name: "空", confirmed: false });
    expect(emptied.room.todayList?.ids).toContain("c");
    expect(toPublicState(emptied.room, thursday).picks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ weekday: 2, name: "空", empty: true, confirmed: false }),
      ]),
    );

    expect(confirmPastDay(emptied.room, thursday, 1)).toEqual({
      ok: false,
      reason: "no-past-pick",
    });
    const confirmedEmpty = confirmPastDay(emptied.room, thursday, 2);
    expect(confirmedEmpty.ok).toBe(true);
    if (!confirmedEmpty.ok) return;
    expect(confirmedEmpty.room.picks[2]?.confirmed).toBe(true);
    expect(choosePastDay(confirmedEmpty.room, thursday, 2, "b")).toEqual({
      ok: false,
      reason: "confirmed",
    });

    const tuesday = choosePastDay(confirmedEmpty.room, thursday, 1, "b");
    expect(tuesday.ok).toBe(true);
    if (!tuesday.ok) return;
    expect(tuesday.room.picks[1]?.name).toBe("Corner Tacos");
    expect(tuesday.room.todayList?.ids).not.toContain("b");
    const locked = confirmPastDay(tuesday.room, thursday, 1);
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    expect(locked.room.picks[1]?.confirmed).toBe(true);
  });

  it("lets the weekend reopen any unconfirmed weekday, including an empty one", () => {
    const saturday = new Date("2026-10-03T04:00:00.000Z");
    const room = prepareRoom(
      {
        ...emptyRoom(),
        timezone: "Asia/Shanghai",
        weekId: "2026-09-28",
        restaurants: places,
        picks: {
          0: { restaurantId: "a", name: "Noodle Room", confirmed: true },
          4: { restaurantId: "b", name: "Corner Tacos", confirmed: false },
        },
      },
      saturday,
    ).room;

    expect(toPublicState(room, saturday).isWeekend).toBe(true);
    expect(choosePastDay(room, saturday, 0, null)).toEqual({ ok: false, reason: "confirmed" });
    const emptied = choosePastDay(room, saturday, 4, null);
    expect(emptied.ok).toBe(true);
    if (!emptied.ok) return;
    expect(emptied.room.picks[4]).toMatchObject({ empty: true, name: "空", confirmed: false });
    const locked = confirmPastDay(emptied.room, saturday, 4);
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    expect(locked.room.picks[4]?.confirmed).toBe(true);
    expect(choosePastDay(locked.room, saturday, 4, "c")).toEqual({
      ok: false,
      reason: "confirmed",
    });
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
