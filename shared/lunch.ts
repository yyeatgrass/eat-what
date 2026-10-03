export const NAME_LIMIT = 80;

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type ElectionDay = 0 | 1 | 2 | 3 | 4;

export type Restaurant = {
  id: string;
  name: string;
};

export type DayPick = {
  restaurantId: string;
  name: string;
};

export type Picks = Partial<Record<ElectionDay, DayPick>>;

export type RoomData = {
  timezone: string | null;
  restaurants: Restaurant[];
  weekId: string | null;
  picks: Picks;
  /** Weekend-only stand-in so a manual test can run the weekday draw. */
  debugKitchen: boolean;
};

export type Phase =
  | "needs-timezone"
  | "weekend"
  | "empty"
  | "exhausted"
  | "ready"
  | "picked";

export type PublicPick = {
  weekday: ElectionDay;
  restaurantId: string;
  name: string;
};

export type PublicState = {
  timezone: string | null;
  restaurants: Restaurant[];
  weekId: string | null;
  weekday: WeekdayIndex | null;
  weekdayName: string | null;
  dateLabel: string | null;
  isWeekend: boolean;
  picks: PublicPick[];
  todayPick: DayPick | null;
  onlyOption: boolean;
  exhausted: boolean;
  phase: Phase;
  debugKitchen: boolean;
  /** True when the weekend clock is standing in as Friday. */
  debugStandIn: boolean;
  realDateLabel: string | null;
  realWeekdayName: string | null;
};

export type ClientMessage =
  | { type: "setTimezone"; timezone: string }
  | { type: "addRestaurant"; name: string }
  | { type: "removeRestaurant"; id: string }
  | { type: "pick" }
  | { type: "heartbeat" }
  | { type: "setDebugKitchen"; open: boolean };

export type ServerMessage =
  | { type: "state"; state: PublicState }
  | {
      type: "error";
      scope: "restaurant" | "timezone" | "pick";
      message: string;
    };

export type ElectionFailure = "weekend" | "empty" | "exhausted";

export type ElectionResult =
  | { ok: false; reason: ElectionFailure }
  | { ok: true; restaurant: Restaurant; onlyOption: boolean };

const WEEKDAY_INDEX: Record<string, WeekdayIndex> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const ELECTION_DAYS: readonly ElectionDay[] = [0, 1, 2, 3, 4];

export function emptyRoom(): RoomData {
  return {
    timezone: null,
    restaurants: [],
    weekId: null,
    picks: {},
    debugKitchen: false,
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export type CalendarDate = {
  year: number;
  month: number;
  day: number;
  weekday: WeekdayIndex;
};

export function weekdayIndex(shortName: string): WeekdayIndex {
  const normalized = shortName.replace(".", "").slice(0, 3);
  const index = WEEKDAY_INDEX[normalized];
  if (index === undefined) {
    throw new Error(`Unexpected weekday label: ${shortName}`);
  }
  return index;
}

export function calendarInTimeZone(now: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: weekdayIndex(value("weekday")),
  };
}

export function weekIdFor(calendar: CalendarDate): string {
  const monday = new Date(Date.UTC(calendar.year, calendar.month - 1, calendar.day));
  monday.setUTCDate(monday.getUTCDate() - calendar.weekday);
  const year = monday.getUTCFullYear();
  const month = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const day = String(monday.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekIdInTimeZone(now: Date, timeZone: string): string {
  return weekIdFor(calendarInTimeZone(now, timeZone));
}

export function formatDateLabel(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
}

export function formatCalendarLabel(calendar: CalendarDate): string {
  const utc = new Date(Date.UTC(calendar.year, calendar.month - 1, calendar.day, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(utc);
}

/** On a weekend with the debug kitchen open, Friday of the same week stands in. */
export function electionView(
  now: Date,
  timeZone: string,
  debugKitchen: boolean,
): { real: CalendarDate; calendar: CalendarDate; standIn: boolean } {
  const real = calendarInTimeZone(now, timeZone);
  if (!debugKitchen || !isWeekend(real.weekday)) {
    return { real, calendar: real, standIn: false };
  }
  const friday = new Date(Date.UTC(real.year, real.month - 1, real.day));
  friday.setUTCDate(friday.getUTCDate() - (real.weekday - 4));
  return {
    real,
    standIn: true,
    calendar: {
      year: friday.getUTCFullYear(),
      month: friday.getUTCMonth() + 1,
      day: friday.getUTCDate(),
      weekday: 4,
    },
  };
}

export function formatWeekOf(weekId: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekId);
  if (!match) return weekId;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function isWeekend(weekday: WeekdayIndex): boolean {
  return weekday >= 5;
}

export function withSyncedWeek(
  room: RoomData,
  now: Date,
): { room: RoomData; reset: boolean } {
  if (!room.timezone || !isValidTimeZone(room.timezone)) {
    return { room, reset: false };
  }
  const weekId = weekIdInTimeZone(now, room.timezone);
  if (room.weekId === weekId) return { room, reset: false };
  return {
    room: {
      ...room,
      weekId,
      picks: {},
    },
    reset: true,
  };
}

export function eligibleRestaurants(
  restaurants: readonly Restaurant[],
  picks: Picks,
  weekday: WeekdayIndex,
  excludeTodayPick: boolean,
): Restaurant[] {
  const chosenEarlier = new Set<string>();
  const earlierThrough = Math.min(weekday, 5);
  for (let day = 0; day < earlierThrough; day += 1) {
    const pick = picks[day as ElectionDay];
    if (pick) chosenEarlier.add(pick.restaurantId);
  }

  let eligible = restaurants.filter((restaurant) => !chosenEarlier.has(restaurant.id));
  if (!excludeTodayPick || weekday > 4) return eligible;

  const todayPick = picks[weekday as ElectionDay];
  if (!todayPick) return eligible;

  const withoutToday = eligible.filter(
    (restaurant) => restaurant.id !== todayPick.restaurantId,
  );
  return withoutToday.length > 0 ? withoutToday : eligible;
}

export function randomIndex(length: number, rng: () => number): number {
  if (length <= 0) throw new Error("Cannot choose from an empty list.");
  const scaled = Math.floor(rng() * length);
  if (scaled >= length) return length - 1;
  if (scaled < 0) return 0;
  return scaled;
}

export function elect(input: {
  restaurants: readonly Restaurant[];
  picks: Picks;
  weekday: WeekdayIndex;
  reroll: boolean;
  rng: () => number;
}): ElectionResult {
  if (isWeekend(input.weekday)) return { ok: false, reason: "weekend" };
  if (input.restaurants.length === 0) return { ok: false, reason: "empty" };

  const open = eligibleRestaurants(input.restaurants, input.picks, input.weekday, false);
  if (open.length === 0) return { ok: false, reason: "exhausted" };

  const pool = input.reroll
    ? eligibleRestaurants(input.restaurants, input.picks, input.weekday, true)
    : open;
  const restaurant = pool[randomIndex(pool.length, input.rng)];
  if (!restaurant) return { ok: false, reason: "exhausted" };
  return { ok: true, restaurant, onlyOption: open.length === 1 };
}

export function validateRestaurantName(
  name: string,
  restaurants: readonly Restaurant[],
): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a restaurant name." };
  if ([...trimmed].length > NAME_LIMIT) {
    return { ok: false, error: "Keep the name to 80 characters." };
  }
  const key = trimmed.toLocaleLowerCase();
  if (restaurants.some((restaurant) => restaurant.name.toLocaleLowerCase() === key)) {
    return { ok: false, error: "That restaurant is already on the list." };
  }
  return { ok: true, name: trimmed };
}

export function addRestaurant(
  room: RoomData,
  name: string,
  id: string,
): { ok: true; room: RoomData } | { ok: false; error: string } {
  const validated = validateRestaurantName(name, room.restaurants);
  if (!validated.ok) return validated;
  return {
    ok: true,
    room: {
      ...room,
      restaurants: [...room.restaurants, { id, name: validated.name }],
    },
  };
}

export function clearRestaurantFromPicks(picks: Picks, restaurantId: string): Picks {
  const next: Picks = { ...picks };
  for (const day of ELECTION_DAYS) {
    if (next[day]?.restaurantId === restaurantId) delete next[day];
  }
  return next;
}

export function removeRestaurant(room: RoomData, id: string): RoomData {
  if (!room.restaurants.some((restaurant) => restaurant.id === id)) return room;
  return {
    ...room,
    restaurants: room.restaurants.filter((restaurant) => restaurant.id !== id),
    picks: clearRestaurantFromPicks(room.picks, id),
  };
}

export function chooseLunch(
  room: RoomData,
  now: Date,
  rng: () => number,
):
  | { ok: false; reason: ElectionFailure | "needs-timezone" }
  | { ok: true; room: RoomData; onlyOption: boolean } {
  if (!room.timezone || !isValidTimeZone(room.timezone)) {
    return { ok: false, reason: "needs-timezone" };
  }
  const synced = withSyncedWeek(room, now).room;
  const clock = electionView(now, synced.timezone as string, synced.debugKitchen === true);
  const day = clock.calendar.weekday;
  const result = elect({
    restaurants: synced.restaurants,
    picks: synced.picks,
    weekday: day,
    reroll: day <= 4 && Boolean(synced.picks[day as ElectionDay]),
    rng,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    onlyOption: result.onlyOption,
    room: {
      ...synced,
      picks: {
        ...synced.picks,
        [day as ElectionDay]: {
          restaurantId: result.restaurant.id,
          name: result.restaurant.name,
        },
      },
    },
  };
}

export function activePicks(room: RoomData, now: Date): Picks {
  if (!room.timezone || !isValidTimeZone(room.timezone)) return {};
  const weekId = weekIdInTimeZone(now, room.timezone);
  return room.weekId === weekId ? room.picks : {};
}

export function toPublicState(room: RoomData, now: Date): PublicState {
  const restaurants = room.restaurants.map((restaurant) => ({ ...restaurant }));
  if (!room.timezone || !isValidTimeZone(room.timezone)) {
    return {
      timezone: null,
      restaurants,
      weekId: null,
      weekday: null,
      weekdayName: null,
      dateLabel: null,
      isWeekend: false,
      picks: [],
      todayPick: null,
      onlyOption: false,
      exhausted: false,
      phase: "needs-timezone",
      debugKitchen: room.debugKitchen === true,
      debugStandIn: false,
      realDateLabel: null,
      realWeekdayName: null,
    };
  }

  const clock = electionView(now, room.timezone, room.debugKitchen === true);
  const calendar = clock.calendar;
  const weekId = weekIdFor(calendar);
  const picks = room.weekId === weekId ? room.picks : {};
  const weekend = isWeekend(calendar.weekday);
  const todayPick =
    !weekend && calendar.weekday <= 4 ? (picks[calendar.weekday as ElectionDay] ?? null) : null;
  const open = weekend
    ? []
    : eligibleRestaurants(restaurants, picks, calendar.weekday, false);
  const exhausted = !weekend && restaurants.length > 0 && open.length === 0;
  const onlyOption = !weekend && open.length === 1;

  let phase: Phase;
  if (weekend) phase = "weekend";
  else if (restaurants.length === 0) phase = "empty";
  else if (exhausted) phase = "exhausted";
  else if (todayPick) phase = "picked";
  else phase = "ready";

  return {
    timezone: room.timezone,
    restaurants,
    weekId,
    weekday: calendar.weekday,
    weekdayName: WEEKDAY_NAMES[calendar.weekday],
    dateLabel: clock.standIn
      ? formatCalendarLabel(calendar)
      : formatDateLabel(now, room.timezone),
    isWeekend: weekend,
    debugKitchen: room.debugKitchen === true,
    debugStandIn: clock.standIn,
    realDateLabel: formatDateLabel(now, room.timezone),
    realWeekdayName: WEEKDAY_NAMES[clock.real.weekday],
    picks: ELECTION_DAYS.flatMap((day) => {
      const pick = picks[day];
      return pick
        ? [{ weekday: day, restaurantId: pick.restaurantId, name: pick.name }]
        : [];
    }),
    todayPick,
    onlyOption,
    exhausted,
    phase,
  };
}

export const PICK_ERRORS: Record<ElectionFailure | "needs-timezone", string> = {
  weekend: "It's the weekend, so there's no lunch election.",
  empty: "Add a restaurant before picking lunch.",
  exhausted: "Every restaurant was already chosen earlier this week.",
  "needs-timezone": "Confirm a timezone before picking lunch.",
};
