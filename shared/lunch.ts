export const NAME_LIMIT = 80;

/** The only clock this table uses. */
export const ROOM_TIME_ZONE = "Asia/Shanghai";

export const WEEKDAY_NAMES = [
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
  "星期日",
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
  /** Set when the table locks today's result. */
  confirmed?: boolean;
};

export type Picks = Partial<Record<ElectionDay, DayPick>>;

export type TodayList = {
  weekId: string;
  weekday: ElectionDay;
  ids: string[];
};

export type RoomData = {
  timezone: string | null;
  restaurants: Restaurant[];
  weekId: string | null;
  picks: Picks;
  /** Temporary draw list for one weekday. Null on a weekend. */
  todayList: TodayList | null;
  /** Weekend-only stand-in so a manual test can run the weekday draw. */
  debugKitchen: boolean;
  /** Pinned calendar date. When set, the table uses this day instead of the clock. */
  debugDate: { year: number; month: number; day: number } | null;
};

export type Phase =
  | "needs-timezone"
  | "weekend"
  | "empty"
  | "exhausted"
  | "today-empty"
  | "ready"
  | "picked";

export type PublicPick = {
  weekday: ElectionDay;
  restaurantId: string;
  name: string;
  confirmed: boolean;
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
  todayRestaurants: Restaurant[];
  todayPick: DayPick | null;
  onlyOption: boolean;
  exhausted: boolean;
  phase: Phase;
  debugKitchen: boolean;
  /** True when the weekend clock is standing in as Friday. */
  debugStandIn: boolean;
  /** True when Next day has pinned the table to a chosen calendar date. */
  debugPinned: boolean;
  realDateLabel: string | null;
  realWeekdayName: string | null;
};

export type ClientMessage =
  | { type: "setTimezone"; timezone: string }
  | { type: "addRestaurant"; name: string }
  | { type: "removeRestaurant"; id: string }
  | { type: "removeFromToday"; id: string }
  | { type: "pick" }
  | { type: "choose"; id: string }
  | { type: "confirm" }
  | { type: "heartbeat" }
  | { type: "setDebugKitchen"; open: boolean }
  | { type: "advanceDebugDay" };

export type ServerMessage =
  | { type: "state"; state: PublicState }
  | {
      type: "error";
      scope: "restaurant" | "timezone" | "pick";
      message: string;
    };

export type ElectionFailure = "weekend" | "empty" | "exhausted" | "today-empty";

export type ChooseRefusal =
  | ElectionFailure
  | "needs-timezone"
  | "confirmed"
  | "no-pick"
  | "not-today";

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
    timezone: ROOM_TIME_ZONE,
    restaurants: [],
    weekId: null,
    picks: {},
    todayList: null,
    debugKitchen: false,
    debugDate: null,
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
  return formatCalendarLabel(calendarInTimeZone(now, timeZone));
}

export function formatCalendarLabel(calendar: CalendarDate): string {
  return `${calendar.year}年${calendar.month}月${calendar.day}日 ${WEEKDAY_NAMES[calendar.weekday]}`;
}

export function calendarFromParts(year: number, month: number, day: number): CalendarDate {
  const utc = new Date(Date.UTC(year, month - 1, day));
  const sundayBased = utc.getUTCDay();
  const weekday = (sundayBased === 0 ? 6 : sundayBased - 1) as WeekdayIndex;
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    weekday,
  };
}

export function addCalendarDays(calendar: CalendarDate, days: number): CalendarDate {
  return calendarFromParts(calendar.year, calendar.month, calendar.day + days);
}

function pinnedDebugDate(
  debugDate: RoomData["debugDate"] | undefined,
): RoomData["debugDate"] {
  if (!debugDate) return null;
  if (!Number.isInteger(debugDate.year) || !Number.isInteger(debugDate.month) || !Number.isInteger(debugDate.day)) {
    return null;
  }
  return debugDate;
}

/** A pinned debug date wins. Otherwise a weekend debug kitchen stands in as Friday. */
export function electionView(
  now: Date,
  timeZone: string,
  debugKitchen: boolean,
  debugDate?: RoomData["debugDate"],
): { real: CalendarDate; calendar: CalendarDate; standIn: boolean; pinned: boolean } {
  const real = calendarInTimeZone(now, timeZone);
  const pinned = pinnedDebugDate(debugDate);
  if (pinned) {
    return {
      real,
      pinned: true,
      standIn: false,
      calendar: calendarFromParts(pinned.year, pinned.month, pinned.day),
    };
  }
  if (!debugKitchen || !isWeekend(real.weekday)) {
    return { real, calendar: real, standIn: false, pinned: false };
  }
  const friday = addCalendarDays(real, 4 - real.weekday);
  return { real, standIn: true, pinned: false, calendar: friday };
}

export function advanceDebugDay(room: RoomData, now: Date): RoomData {
  if (!room.timezone || !isValidTimeZone(room.timezone)) return room;
  const clock = electionView(now, room.timezone, room.debugKitchen === true, room.debugDate);
  const next = addCalendarDays(clock.calendar, 1);
  return prepareRoom(
    {
      ...room,
      debugKitchen: true,
      debugDate: { year: next.year, month: next.month, day: next.day },
    },
    now,
  ).room;
}

export function formatWeekOf(weekId: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekId);
  if (!match) return weekId;
  return `${Number(match[2])}月${Number(match[3])}日`;
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
  const clock = electionView(now, room.timezone, room.debugKitchen === true, room.debugDate);
  const weekId = weekIdFor(clock.calendar);
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

/** Restaurants still available before today, in whole-list order. */
export function selectableRestaurants(
  restaurants: readonly Restaurant[],
  picks: Picks,
  weekday: WeekdayIndex,
): Restaurant[] {
  return eligibleRestaurants(restaurants, picks, weekday, false);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * On a new weekday, today's list is a copy of every restaurant not already
 * chosen this week. Removals made today stay until the day changes.
 */
export function syncTodayList(room: RoomData, now: Date): { room: RoomData; changed: boolean } {
  if (!room.timezone || !isValidTimeZone(room.timezone)) {
    return { room, changed: false };
  }
  const clock = electionView(now, room.timezone, room.debugKitchen === true, room.debugDate);
  if (isWeekend(clock.calendar.weekday)) {
    if (room.todayList === null) return { room, changed: false };
    return { room: { ...room, todayList: null }, changed: true };
  }

  const weekId = weekIdFor(clock.calendar);
  const weekday = clock.calendar.weekday as ElectionDay;
  const picks = room.weekId === weekId ? room.picks : {};
  const fresh = selectableRestaurants(room.restaurants, picks, weekday).map(
    (restaurant) => restaurant.id,
  );
  const current = room.todayList;
  if (!current || current.weekId !== weekId || current.weekday !== weekday) {
    return {
      room: { ...room, todayList: { weekId, weekday, ids: fresh } },
      changed: true,
    };
  }

  const allowed = new Set(fresh);
  const seen = new Set<string>();
  const ids = current.ids.filter((id) => {
    if (!allowed.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (sameIds(ids, current.ids)) return { room, changed: false };
  return { room: { ...room, todayList: { ...current, ids } }, changed: true };
}

export function prepareRoom(room: RoomData, now: Date): { room: RoomData; changed: boolean } {
  const synced = withSyncedWeek(room, now);
  const listed = syncTodayList(synced.room, now);
  return { room: listed.room, changed: synced.reset || listed.changed };
}

export function restaurantsForToday(room: RoomData, now: Date): Restaurant[] {
  if (!room.timezone || !isValidTimeZone(room.timezone)) return [];
  const clock = electionView(now, room.timezone, room.debugKitchen === true, room.debugDate);
  if (isWeekend(clock.calendar.weekday)) return [];
  const weekId = weekIdFor(clock.calendar);
  const weekday = clock.calendar.weekday as ElectionDay;
  const picks = room.weekId === weekId ? room.picks : {};
  const selectable = selectableRestaurants(room.restaurants, picks, weekday);
  const allowed = new Set(selectable.map((restaurant) => restaurant.id));
  const stored = room.todayList;
  const ids =
    stored && stored.weekId === weekId && stored.weekday === weekday
      ? stored.ids.filter((id) => allowed.has(id))
      : selectable.map((restaurant) => restaurant.id);
  const byId = new Map(room.restaurants.map((restaurant) => [restaurant.id, restaurant]));
  return ids.flatMap((id) => {
    const restaurant = byId.get(id);
    return restaurant ? [restaurant] : [];
  });
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
  if (!trimmed) return { ok: false, error: "请填写餐厅名字。" };
  if ([...trimmed].length > NAME_LIMIT) {
    return { ok: false, error: "名字请控制在 80 个字以内。" };
  }
  const key = trimmed.toLocaleLowerCase();
  if (restaurants.some((restaurant) => restaurant.name.toLocaleLowerCase() === key)) {
    return { ok: false, error: "这家餐厅已经在列表上了。" };
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
      todayList: appendToOpenTodayList(room, id),
    },
  };
}

/** A new place joins today's draw while that day is still open. A confirmed day stays locked. */
function appendToOpenTodayList(room: RoomData, id: string): TodayList | null {
  const todayList = room.todayList;
  if (!todayList || todayList.ids.includes(id)) return todayList;
  if (room.picks[todayList.weekday]?.confirmed === true) return todayList;
  return { ...todayList, ids: [...todayList.ids, id] };
}

export function clearRestaurantFromPicks(picks: Picks, restaurantId: string): Picks {
  const next: Picks = { ...picks };
  for (const day of ELECTION_DAYS) {
    if (next[day]?.restaurantId === restaurantId) delete next[day];
  }
  return next;
}

export function choiceLocked(room: RoomData, restaurantId: string): boolean {
  return ELECTION_DAYS.some((day) => {
    const pick = room.picks[day];
    return pick?.restaurantId === restaurantId && pick.confirmed === true;
  });
}

export function removeRestaurant(room: RoomData, id: string): RoomData {
  if (!room.restaurants.some((restaurant) => restaurant.id === id)) return room;
  if (choiceLocked(room, id)) return room;
  return {
    ...room,
    restaurants: room.restaurants.filter((restaurant) => restaurant.id !== id),
    picks: clearRestaurantFromPicks(room.picks, id),
    todayList: room.todayList
      ? { ...room.todayList, ids: room.todayList.ids.filter((item) => item !== id) }
      : null,
  };
}

/** Drops a place from today's draw only. A second remove of the same id does nothing. */
export function removeFromToday(room: RoomData, id: string): RoomData {
  if (!room.todayList?.ids.includes(id)) return room;
  const weekday = room.todayList.weekday;
  const locked = room.picks[weekday];
  if (locked?.confirmed === true && locked.restaurantId === id) return room;
  const picks = { ...room.picks };
  if (picks[weekday]?.restaurantId === id) delete picks[weekday];
  return {
    ...room,
    picks,
    todayList: {
      ...room.todayList,
      ids: room.todayList.ids.filter((item) => item !== id),
    },
  };
}

function openDraw(
  room: RoomData,
  now: Date,
):
  | { ok: false; reason: ChooseRefusal }
  | { ok: true; room: RoomData; day: ElectionDay; todayRestaurants: Restaurant[] } {
  if (!room.timezone || !isValidTimeZone(room.timezone)) {
    return { ok: false, reason: "needs-timezone" };
  }
  const synced = prepareRoom(room, now).room;
  const clock = electionView(
    now,
    synced.timezone as string,
    synced.debugKitchen === true,
    synced.debugDate,
  );
  const day = clock.calendar.weekday;
  if (isWeekend(day)) return { ok: false, reason: "weekend" };
  if (synced.restaurants.length === 0) return { ok: false, reason: "empty" };
  if (synced.picks[day as ElectionDay]?.confirmed === true) {
    return { ok: false, reason: "confirmed" };
  }
  const todayRestaurants = restaurantsForToday(synced, now);
  if (todayRestaurants.length === 0) {
    const selectable = selectableRestaurants(synced.restaurants, synced.picks, day);
    return { ok: false, reason: selectable.length === 0 ? "exhausted" : "today-empty" };
  }
  return { ok: true, room: synced, day: day as ElectionDay, todayRestaurants };
}

function storePick(room: RoomData, day: ElectionDay, restaurant: Restaurant): RoomData {
  return {
    ...room,
    picks: {
      ...room.picks,
      [day]: {
        restaurantId: restaurant.id,
        name: restaurant.name,
        confirmed: false,
      },
    },
  };
}

export function chooseLunch(
  room: RoomData,
  now: Date,
  rng: () => number,
):
  | { ok: false; reason: ChooseRefusal }
  | { ok: true; room: RoomData; onlyOption: boolean } {
  const opened = openDraw(room, now);
  if (!opened.ok) return opened;
  const result = elect({
    restaurants: opened.todayRestaurants,
    picks: opened.room.picks,
    weekday: opened.day,
    reroll: Boolean(opened.room.picks[opened.day]),
    rng,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    onlyOption: result.onlyOption,
    room: storePick(opened.room, opened.day, result.restaurant),
  };
}

/** Sets today's result to one place still on today's list. A locked day stays locked. */
export function chooseRestaurant(
  room: RoomData,
  now: Date,
  restaurantId: string,
): { ok: false; reason: ChooseRefusal } | { ok: true; room: RoomData } {
  const opened = openDraw(room, now);
  if (!opened.ok) return opened;
  const restaurant = opened.todayRestaurants.find((item) => item.id === restaurantId);
  if (!restaurant) return { ok: false, reason: "not-today" };
  return { ok: true, room: storePick(opened.room, opened.day, restaurant) };
}

export function confirmToday(
  room: RoomData,
  now: Date,
): { ok: false; reason: ChooseRefusal } | { ok: true; room: RoomData } {
  if (!room.timezone || !isValidTimeZone(room.timezone)) {
    return { ok: false, reason: "needs-timezone" };
  }
  const synced = prepareRoom(room, now).room;
  const clock = electionView(
    now,
    synced.timezone as string,
    synced.debugKitchen === true,
    synced.debugDate,
  );
  const day = clock.calendar.weekday;
  if (isWeekend(day)) return { ok: false, reason: "weekend" };
  const pick = synced.picks[day as ElectionDay];
  if (!pick) return { ok: false, reason: "no-pick" };
  if (pick.confirmed === true) return { ok: true, room: synced };
  return {
    ok: true,
    room: {
      ...synced,
      picks: {
        ...synced.picks,
        [day as ElectionDay]: { ...pick, confirmed: true },
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
      todayRestaurants: [],
      todayPick: null,
      onlyOption: false,
      exhausted: false,
      phase: "needs-timezone",
      debugKitchen: room.debugKitchen === true,
      debugStandIn: false,
      debugPinned: false,
      realDateLabel: null,
      realWeekdayName: null,
    };
  }

  const clock = electionView(now, room.timezone, room.debugKitchen === true, room.debugDate);
  const calendar = clock.calendar;
  const weekId = weekIdFor(calendar);
  const picks = room.weekId === weekId ? room.picks : {};
  const weekend = isWeekend(calendar.weekday);
  const todayRestaurants = restaurantsForToday(room, now);
  const todayPickRaw =
    !weekend && calendar.weekday <= 4 ? (picks[calendar.weekday as ElectionDay] ?? null) : null;
  const todayPick =
    todayPickRaw &&
    (todayPickRaw.confirmed === true ||
      todayRestaurants.some((restaurant) => restaurant.id === todayPickRaw.restaurantId))
      ? { ...todayPickRaw, confirmed: todayPickRaw.confirmed === true }
      : null;
  const selectable = weekend
    ? []
    : selectableRestaurants(restaurants, picks, calendar.weekday);
  const exhausted = !weekend && restaurants.length > 0 && selectable.length === 0;
  const todayEmpty = !weekend && !exhausted && restaurants.length > 0 && todayRestaurants.length === 0;
  const onlyOption = !weekend && todayRestaurants.length === 1;

  let phase: Phase;
  if (weekend) phase = "weekend";
  else if (restaurants.length === 0) phase = "empty";
  else if (exhausted) phase = "exhausted";
  else if (todayEmpty) phase = "today-empty";
  else if (todayPick) phase = "picked";
  else phase = "ready";

  return {
    timezone: room.timezone,
    restaurants,
    weekId,
    weekday: calendar.weekday,
    weekdayName: WEEKDAY_NAMES[calendar.weekday],
    dateLabel:
      clock.standIn || clock.pinned
        ? formatCalendarLabel(calendar)
        : formatDateLabel(now, room.timezone),
    isWeekend: weekend,
    debugKitchen: room.debugKitchen === true,
    debugStandIn: clock.standIn,
    debugPinned: clock.pinned,
    realDateLabel: formatDateLabel(now, room.timezone),
    realWeekdayName: WEEKDAY_NAMES[clock.real.weekday],
    picks: ELECTION_DAYS.flatMap((day) => {
      const pick = picks[day];
      return pick
        ? [
            {
              weekday: day,
              restaurantId: pick.restaurantId,
              name: pick.name,
              confirmed: pick.confirmed === true,
            },
          ]
        : [];
    }),
    todayRestaurants,
    todayPick,
    onlyOption,
    exhausted,
    phase,
  };
}

export const PICK_ERRORS: Record<ChooseRefusal, string> = {
  weekend: "周末不选餐厅。",
  empty: "先加一家餐厅，再抽今天吃什么。",
  exhausted: "这周每家餐厅都已经选过了。",
  "today-empty": "今天的列表是空的，总列表没有变。",
  "needs-timezone": "先确认时区，再抽今天吃什么。",
  confirmed: "今天已经确定了，不能再改。",
  "no-pick": "先抽出今天的午饭，再确定。",
  "not-today": "这家不在今天的列表里。",
};
