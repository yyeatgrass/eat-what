import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NAME_LIMIT, formatWeekOf, type PublicState } from "../shared/lunch";
import { useRoom, type ConnectionStatus, type RoomNotice } from "./use-room";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const EMPTY_RESTAURANTS: PublicState["restaurants"] = [];

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function timeZones(): string[] {
  const supported = (
    Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("timeZone");
  const zones = supported && supported.length > 0 ? [...supported] : [];
  if (!zones.includes("UTC")) zones.unshift("UTC");
  return zones.length > 0 ? zones : ["UTC"];
}

export default function App() {
  const { status, state, notice, send } = useRoom();
  const timezone = state?.timezone ?? null;
  const [changeOpen, setChangeOpen] = useState(false);
  const [trackedTimezone, setTrackedTimezone] = useState<string | null | undefined>(undefined);

  if (state && trackedTimezone !== timezone) {
    setTrackedTimezone(timezone);
    if (trackedTimezone !== undefined) setChangeOpen(false);
  }

  const timezoneRequired = Boolean(state && !timezone);
  const zoneOpen = timezoneRequired || changeOpen;

  return (
    <div className="min-h-svh text-foreground">
      <Header
        status={status}
        state={state}
        onChangeTimezone={() => setChangeOpen(true)}
      />
      {status === "disconnected" && state ? (
        <p className="mx-auto mt-4 w-full max-w-5xl px-4 text-sm text-primary sm:px-6">
          The table connection dropped. Reconnecting…
        </p>
      ) : null}
      {state && (state.debugStandIn || state.debugPinned) ? (
        <div className="mx-auto mt-4 flex w-full max-w-5xl flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
            {state.debugStandIn
              ? `Restaurant picking is open for a test. It's ${state.realDateLabel}, so ${state.weekdayName} is standing in.`
              : `Debug clock is on ${state.dateLabel}. The real date is ${state.realDateLabel}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={status !== "live"}
              onClick={() => send({ type: "advanceDebugDay" })}
            >
              Next day
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={status !== "live"}
              onClick={() => send({ type: "setDebugKitchen", open: false })}
            >
              Close the test
            </Button>
          </div>
        </div>
      ) : null}
      <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.85fr)]">
        <Decision status={status} state={state} notice={notice} send={send} />
        <WeekStrip state={state} />
        <RestaurantList
          status={status}
          state={state}
          notice={notice}
          send={send}
        />
      </main>
      <TimezoneDialog
        open={zoneOpen}
        required={timezoneRequired}
        current={timezone}
        status={status}
        notice={notice}
        onOpenChange={setChangeOpen}
        send={send}
      />
    </div>
  );
}

function Header({
  status,
  state,
  onChangeTimezone,
}: {
  status: ConnectionStatus;
  state: PublicState | null;
  onChangeTimezone: () => void;
}) {
  const live = status === "live";
  const label = live ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting";

  return (
    <header className="border-b border-foreground/10 bg-card/85 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-4 px-4 py-5 sm:px-6">
        <div>
          <p className="text-xs font-medium tracking-[0.22em] text-primary uppercase">
            Shared table
          </p>
          <h1 className="font-heading text-4xl leading-none font-semibold tracking-tight italic sm:text-5xl">
            eat what
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Weekday lunch for one table. The list and the pick belong to everyone on this page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm">
            <span
              className={`size-2 rounded-full ${live ? "bg-accent-foreground" : "bg-primary"}`}
              aria-hidden
            />
            {label}
          </span>
          <Button type="button" variant="outline" onClick={onChangeTimezone} disabled={!state}>
            {state?.timezone ?? "Set timezone"}
          </Button>
        </div>
      </div>
    </header>
  );
}

function Decision({
  status,
  state,
  notice,
  send,
}: {
  status: ConnectionStatus;
  state: PublicState | null;
  notice: RoomNotice | null;
  send: ReturnType<typeof useRoom>["send"];
}) {
  const pickError = notice?.scope === "pick" ? notice.message : null;

  if (!state) {
    return (
      <Ticket>
        <Eyebrow>The table</Eyebrow>
        <h2 className="font-heading text-4xl leading-tight font-semibold">
          {status === "disconnected" ? "Can't reach the table." : "Pulling up a chair."}
        </h2>
        <p className="max-w-md text-muted-foreground">
          {status === "disconnected"
            ? "The connection dropped. Trying again in a moment."
            : "Connecting to the shared lunch list."}
        </p>
      </Ticket>
    );
  }

  if (state.phase === "needs-timezone") {
    return (
      <Ticket>
        <Eyebrow>One clock for the table</Eyebrow>
        <h2 className="font-heading text-4xl leading-tight font-semibold">
          Lunch needs a timezone.
        </h2>
        <p className="max-w-md text-muted-foreground">
          Today and the Monday–Friday week come from the server clock in a timezone you choose
          together. It is not each person's laptop date.
        </p>
      </Ticket>
    );
  }

  if (state.phase === "weekend") {
    return (
      <Ticket>
        <Eyebrow>{state.dateLabel}</Eyebrow>
        <h2 className="font-heading text-4xl leading-tight font-semibold text-balance">
          No restaurant is chosen today.
        </h2>
        <p className="max-w-md text-muted-foreground">
          {state.weekdayName} doesn't get a restaurant. The list stays. Monday opens a new week,
          and every place is eligible again.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            size="lg"
            className="h-12 px-6 text-base"
            disabled={status !== "live"}
            onClick={() => send({ type: "setDebugKitchen", open: true })}
          >
            Pick a restaurant
          </Button>
          {state.debugPinned ? null : (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-12 px-6 text-base"
              disabled={status !== "live"}
              onClick={() => send({ type: "advanceDebugDay" })}
            >
              Next day
            </Button>
          )}
        </div>
      </Ticket>
    );
  }

  if (state.phase === "empty") {
    return (
      <Ticket>
        <Eyebrow>{state.dateLabel}</Eyebrow>
        <h2 className="font-heading text-4xl leading-tight font-semibold">Nothing to draw yet.</h2>
        <p className="max-w-md text-muted-foreground">
          Add the places this table actually goes. Once a name is on the list, anyone here can
          pick today's restaurant.
        </p>
      </Ticket>
    );
  }

  if (state.phase === "exhausted") {
    return (
      <Ticket>
        <Eyebrow>{state.dateLabel}</Eyebrow>
        <h2 className="font-heading text-4xl leading-tight font-semibold text-balance">
          Every place already had a turn.
        </h2>
        <p className="max-w-md text-muted-foreground">
          Each restaurant was chosen on an earlier weekday this week. Nothing new gets invented.
          Picks reset when Monday starts, and the list stays.
        </p>
      </Ticket>
    );
  }

  const picked = state.phase === "picked" && state.todayPick;

  return (
    <Ticket>
      <Eyebrow>{state.dateLabel}</Eyebrow>
      {picked ? (
        <div key={state.todayPick?.restaurantId} className="ticket-in">
          <p className="text-sm text-muted-foreground">Today's lunch</p>
          <h2 className="font-heading text-5xl leading-[1.05] font-semibold text-balance sm:text-6xl">
            {state.todayPick?.name}
          </h2>
          <p className="text-muted-foreground">Chosen for the table.</p>
        </div>
      ) : (
        <div>
          <h2 className="font-heading text-4xl leading-tight font-semibold sm:text-5xl">
            Who's feeding the table?
          </h2>
          <p className="max-w-md text-muted-foreground">
            One draw, shared by everyone here. Places already chosen earlier this week stay out of
            the hat.
          </p>
        </div>
      )}
      {state.onlyOption ? (
        <p className="max-w-md rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          Only one place is left that hasn't been chosen yet this week.
          {picked ? " Picking again will choose it." : ""}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          size="lg"
          className="h-12 px-6 text-base"
          disabled={status !== "live"}
          onClick={() => send({ type: "pick" })}
        >
          {picked ? "Pick another restaurant" : "Pick a restaurant"}
        </Button>
        {status !== "live" ? (
          <p className="text-sm text-muted-foreground">Reconnect to pick for the table.</p>
        ) : null}
      </div>
      {pickError ? (
        <p role="alert" className="text-sm text-destructive">
          {pickError}
        </p>
      ) : null}
    </Ticket>
  );
}

function Ticket({ children }: { children: ReactNode }) {
  return (
    <section className="relative flex min-h-80 flex-col gap-5 overflow-hidden rounded-3xl bg-card px-6 py-8 shadow-[0_24px_50px_-32px_rgba(70,36,16,0.7)] ring-1 ring-foreground/10 sm:px-8">
      <div
        className="absolute inset-x-0 top-0 h-2 bg-[repeating-linear-gradient(90deg,var(--primary)_0_14px,transparent_14px_22px)]"
        aria-hidden
      />
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="pt-2 text-xs font-medium tracking-[0.18em] text-primary uppercase">{children}</p>
  );
}

function WeekStrip({ state }: { state: PublicState | null }) {
  const picks = new Map(state?.picks.map((pick) => [pick.weekday, pick.name]) ?? []);
  return (
    <section className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="mb-4">
        <h2 className="font-heading text-2xl font-semibold">This week</h2>
        <p className="text-sm text-muted-foreground">
          {state?.weekId ? `Week of ${formatWeekOf(state.weekId)}` : "Set a timezone to place the week."}
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {DAY_LABELS.map((label, index) => {
          const name = picks.get(index as 0 | 1 | 2 | 3 | 4);
          const today = state?.weekday === index;
          return (
            <li
              key={label}
              className={`flex items-baseline justify-between gap-3 rounded-2xl px-3 py-2 ${
                today ? "bg-secondary ring-1 ring-primary/40" : "bg-background/70"
              }`}
            >
              <span className="w-12 shrink-0 text-sm font-medium">
                {label}
                {today ? <span className="mt-0.5 block text-[10px] tracking-wide text-primary uppercase">Today</span> : null}
              </span>
              <span className={`text-right text-sm ${name ? "font-heading text-base font-medium" : "text-muted-foreground"}`}>
                {name ?? "Not yet"}
              </span>
            </li>
          );
        })}
      </ol>
      {state?.debugStandIn ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Test pick: {state.weekdayName} stands in for {state.realWeekdayName}.
        </p>
      ) : state?.isWeekend ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No restaurant on {state.weekdayName}. Monday through Friday are the lunch days.
        </p>
      ) : null}
    </section>
  );
}

function RestaurantList({
  status,
  state,
  notice,
  send,
}: {
  status: ConnectionStatus;
  state: PublicState | null;
  notice: RoomNotice | null;
  send: ReturnType<typeof useRoom>["send"];
}) {
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [seenNoticeAt, setSeenNoticeAt] = useState(0);
  const serverError = notice?.scope === "restaurant" ? notice.message : null;
  const error = localError ?? serverError;
  const restaurants = state ? state.restaurants : EMPTY_RESTAURANTS;

  if (
    pendingName &&
    restaurants.some((restaurant) => restaurant.name.toLocaleLowerCase() === pendingName.toLocaleLowerCase())
  ) {
    setPendingName(null);
  } else if (notice?.scope === "restaurant" && notice.at !== seenNoticeAt && pendingName) {
    setSeenNoticeAt(notice.at);
    setName(pendingName);
    setPendingName(null);
  }

  return (
    <section className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 lg:col-span-2 sm:p-6">
      <div className="mb-4">
        <h2 className="font-heading text-2xl font-semibold">Restaurants</h2>
        <p className="text-sm text-muted-foreground">
          Names stay on the list from week to week. Removing a place also clears it if it was
          chosen this week.
        </p>
      </div>
      {restaurants.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">No restaurants yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-border">
          {restaurants.map((restaurant) => (
            <li key={restaurant.id} className="flex items-center justify-between gap-3 py-2">
              <span className="font-heading text-lg font-medium">{restaurant.name}</span>
              <Button
                type="button"
                variant="ghost"
                disabled={status !== "live"}
                onClick={() => send({ type: "removeRestaurant", id: restaurant.id })}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setLocalError(null);
          if (status !== "live") {
            setLocalError("Reconnect to add a restaurant.");
            return;
          }
          const trimmed = name.trim();
          setPendingName(trimmed);
          if (!send({ type: "addRestaurant", name })) {
            setPendingName(null);
            setLocalError("Reconnect to add a restaurant.");
            return;
          }
          setName("");
        }}
      >
        <label className="sr-only" htmlFor="restaurant-name">
          Restaurant name
        </label>
        <Input
          id="restaurant-name"
          value={name}
          maxLength={NAME_LIMIT}
          placeholder="Add a restaurant"
          className="h-11 bg-background text-base"
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setName(event.target.value);
            setLocalError(null);
            setPendingName(null);
          }}
        />
        <Button type="submit" className="h-11 px-5" disabled={status !== "live"}>
          Add
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function TimezoneDialog({
  open,
  required,
  current,
  status,
  notice,
  onOpenChange,
  send,
}: {
  open: boolean;
  required: boolean;
  current: string | null;
  status: ConnectionStatus;
  notice: RoomNotice | null;
  onOpenChange: (open: boolean) => void;
  send: ReturnType<typeof useRoom>["send"];
}) {
  const zones = useMemo(() => timeZones(), []);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(current ?? browserTimeZone());
  const [localError, setLocalError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const serverError = notice?.scope === "timezone" ? notice.message : null;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(current ?? browserTimeZone());
      setQuery("");
      setLocalError(null);
    }
  }

  const filtered = zones.filter((zone) => zone.toLowerCase().includes(query.trim().toLowerCase()));
  const options = filtered.includes(draft) || !draft ? filtered : [draft, ...filtered];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && required) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!required}
        onEscapeKeyDown={(event) => {
          if (required) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (required) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Which clock should lunch follow?</DialogTitle>
          <DialogDescription>
            Today and the Monday–Friday week are decided in this timezone. The server keeps the
            time. Everyone on the page shares it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium" htmlFor="timezone-search">
            Search timezones
          </label>
          <Input
            id="timezone-search"
            value={query}
            placeholder="America/New_York"
            onChange={(event) => setQuery(event.target.value)}
          />
          <label className="sr-only" htmlFor="timezone-list">
            Timezone
          </label>
          <select
            id="timezone-list"
            size={8}
            value={options.includes(draft) ? draft : ""}
            className="w-full rounded-lg border border-input bg-background px-2 py-1 text-sm"
            onChange={(event) => setDraft(event.target.value)}
          >
            {options.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          {localError || serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {localError ?? serverError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={!draft || status !== "live"}
            onClick={() => {
              setLocalError(null);
              if (status !== "live") {
                setLocalError("Reconnect to save the timezone.");
                return;
              }
              send({ type: "setTimezone", timezone: draft });
            }}
          >
            {current ? "Save timezone" : "Use this timezone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
