import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NAME_LIMIT, formatWeekOf, type PublicState } from "../shared/lunch";
import { useRoom, type ConnectionStatus, type RoomNotice } from "./use-room";

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五"] as const;
const EMPTY_RESTAURANTS: PublicState["restaurants"] = [];

export default function App() {
  const { status, state, notice, send } = useRoom();

  return (
    <div className="min-h-svh text-foreground">
      <Header status={status} />
      {status === "disconnected" && state ? (
        <p className="mx-auto mt-4 w-full max-w-5xl px-4 text-sm text-primary sm:px-6">
          和这桌的连接断了，正在重新连接…
        </p>
      ) : null}
      {state && (state.debugStandIn || state.debugPinned) ? (
        <div className="mx-auto mt-4 flex w-full max-w-5xl flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
            {state.debugStandIn
              ? `正在试抽餐厅。实际日期是${state.realDateLabel}，页面按${state.weekdayName}来算。`
              : `试抽日期是${state.dateLabel}。实际日期是${state.realDateLabel}。`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={status !== "live"}
              onClick={() => send({ type: "advanceDebugDay" })}
            >
              下一天
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={status !== "live"}
              onClick={() => send({ type: "setDebugKitchen", open: false })}
            >
              结束试抽
            </Button>
          </div>
        </div>
      ) : null}
      <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.85fr)]">
        <Decision status={status} state={state} notice={notice} send={send} />
        <WeekStrip state={state} />
        <TodayList status={status} state={state} send={send} />
        <RestaurantList
          status={status}
          state={state}
          notice={notice}
          send={send}
        />
      </main>
    </div>
  );
}

function Header({ status }: { status: ConnectionStatus }) {
  const live = status === "live";
  const label = live ? "已连接" : status === "connecting" ? "连接中" : "重新连接";

  return (
    <header className="border-b border-foreground/10 bg-card/85 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-4 px-4 py-5 sm:px-6">
        <div>
          <p className="text-xs font-medium tracking-[0.22em] text-primary uppercase">
            同一桌
          </p>
          <h1 className="font-heading text-4xl leading-none font-semibold tracking-tight italic sm:text-5xl">
            eat what
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            工作日午饭，一桌人一起吃。列表和抽中的结果，打开这个页面的人都看得到。
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
          <span className="rounded-full bg-secondary px-3 py-1 text-sm">
            上海时间
          </span>
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
        <Eyebrow>入座</Eyebrow>
        <h2 className="font-heading text-4xl leading-tight font-semibold">
          {status === "disconnected" ? "连不上这桌。" : "正在入座。"}
        </h2>
        <p className="max-w-md text-muted-foreground">
          {status === "disconnected"
            ? "连接断了，过一会儿再试。"
            : "正在连上共享的午饭列表。"}
        </p>
      </Ticket>
    );
  }

  if (state.phase === "needs-timezone") {
    return (
      <Ticket>
        <Eyebrow>同一只钟</Eyebrow>
        <h2 className="font-heading text-4xl leading-tight font-semibold">
          午饭按上海时间算。
        </h2>
        <p className="max-w-md text-muted-foreground">
          今天是周几，由服务器上的上海时间决定，不看每个人自己电脑上的日期。
        </p>
      </Ticket>
    );
  }

  if (state.phase === "weekend") {
    return (
      <Ticket>
        <Eyebrow>{state.dateLabel}</Eyebrow>
        <h2 className="font-heading text-4xl leading-tight font-semibold text-balance">
          今天不选餐厅。
        </h2>
        <p className="max-w-md text-muted-foreground">
          {state.weekdayName}不抽。列表还在。周一开新的一周，每家都能再抽。
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            size="lg"
            className="h-12 px-6 text-base"
            disabled={status !== "live"}
            onClick={() => send({ type: "setDebugKitchen", open: true })}
          >
            抽一家餐厅
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
              下一天
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
        <h2 className="font-heading text-4xl leading-tight font-semibold">还没有可以抽的。</h2>
        <p className="max-w-md text-muted-foreground">
          先把这桌常去的地方加进来。列表上有名字之后，谁都可以抽今天的午饭。
        </p>
      </Ticket>
    );
  }

  if (state.phase === "today-empty") {
    return (
      <Ticket>
        <Eyebrow>{state.dateLabel}</Eyebrow>
        <h2 className="font-heading text-4xl leading-tight font-semibold text-balance">
          今天没有可抽的了。
        </h2>
        <p className="max-w-md text-muted-foreground">
          这桌把今天列表上的都去掉了。总列表还在，新的一天会再抄一份。
        </p>
        <ManualPick status={status} restaurants={state.todayRestaurants} send={send} />
      </Ticket>
    );
  }

  if (state.phase === "exhausted") {
    return (
      <Ticket>
        <Eyebrow>{state.dateLabel}</Eyebrow>
        <h2 className="font-heading text-4xl leading-tight font-semibold text-balance">
          每家都轮过了。
        </h2>
        <p className="max-w-md text-muted-foreground">
          这周前面的日子已经把每家餐厅都选过了。不会再编一家出来。周一重新开始，列表还留着。
        </p>
        <ManualPick status={status} restaurants={state.todayRestaurants} send={send} />
      </Ticket>
    );
  }

  const picked = state.phase === "picked" && state.todayPick;
  const confirmed = Boolean(picked && state.todayPick?.confirmed);

  return (
    <Ticket>
      <Eyebrow>{state.dateLabel}</Eyebrow>
      {picked ? (
        <div key={state.todayPick?.restaurantId} className="ticket-in">
          <p className="text-sm text-muted-foreground">今天的午饭</p>
          <h2 className="font-heading text-5xl leading-[1.05] font-semibold text-balance sm:text-6xl">
            {state.todayPick?.name}
          </h2>
          <p className="text-muted-foreground">
            {confirmed ? "已经确定，今天不能再改。" : "这桌今天就吃这家。确定之后就不能再改。"}
          </p>
        </div>
      ) : (
        <div>
          <h2 className="font-heading text-4xl leading-tight font-semibold sm:text-5xl">
            今天吃哪家？
          </h2>
          <p className="max-w-md text-muted-foreground">
            从今天的列表里抽一家，在座的人看到的是同一个结果。
          </p>
        </div>
      )}
      {state.onlyOption && !confirmed ? (
        <p className="max-w-md rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
          这周还没选过的，只剩这一家。
          {picked ? "再抽一次还会抽到它。" : ""}
        </p>
      ) : null}
      {confirmed ? null : (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          size="lg"
          className="h-12 px-6 text-base"
          disabled={status !== "live"}
          onClick={() => send({ type: "pick" })}
        >
          {picked ? "再抽一家" : "抽一家餐厅"}
        </Button>
        <ManualPick status={status} restaurants={state.todayRestaurants} send={send} />
        {picked ? (
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="h-12 px-6 text-base"
            disabled={status !== "live"}
            onClick={() => send({ type: "confirm" })}
          >
            确定今天的选择
          </Button>
        ) : null}
        {status !== "live" ? (
          <p className="text-sm text-muted-foreground">重新连上之后才能抽。</p>
        ) : null}
      </div>
      )}
      {pickError ? (
        <p role="alert" className="text-sm text-destructive">
          {pickError}
        </p>
      ) : null}
    </Ticket>
  );
}

function ManualPick({
  status,
  restaurants,
  send,
}: {
  status: ConnectionStatus;
  restaurants: PublicState["restaurants"];
  send: ReturnType<typeof useRoom>["send"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        size="lg"
        variant="outline"
        className="h-12 px-6 text-base"
        disabled={status !== "live"}
        onClick={() => setOpen(true)}
      >
        自己选
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>自己选</DialogTitle>
          <DialogDescription>
            {restaurants.length === 0
              ? "今天的列表是空的，没有可以选的。"
              : "从今天还在的餐厅里选一家。这桌看到的是同一个结果。"}
          </DialogDescription>
        </DialogHeader>
        {restaurants.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {restaurants.map((restaurant) => (
              <li key={restaurant.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full justify-start font-heading text-lg"
                  onClick={() => {
                    send({ type: "choose", id: restaurant.id });
                    setOpen(false);
                  }}
                >
                  {restaurant.name}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
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
  const picks = new Map(state?.picks.map((pick) => [pick.weekday, pick]) ?? []);
  return (
    <section className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="mb-4">
        <h2 className="font-heading text-2xl font-semibold">本周</h2>
        <p className="text-sm text-muted-foreground">
          {state?.weekId ? `从${formatWeekOf(state.weekId)}起` : "用上海时间排这一周。"}
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {DAY_LABELS.map((label, index) => {
          const pick = picks.get(index as 0 | 1 | 2 | 3 | 4);
          const name = pick?.name;
          const today = state?.weekday === index;
          return (
            <li
              key={label}
              className={`flex items-baseline justify-between gap-3 rounded-2xl px-3 py-2 ${
                today ? "bg-secondary ring-1 ring-primary/40" : "bg-background/70"
              }`}
            >
              <span className="w-14 shrink-0 text-sm font-medium">
                {label}
                {today ? <span className="mt-0.5 block text-[10px] tracking-wide text-primary">今天</span> : null}
              </span>
              <span className={`text-right text-sm ${name ? "font-heading text-base font-medium" : "text-muted-foreground"}`}>
                {name ?? "还没定"}
                {pick?.confirmed ? (
                  <span className="mt-0.5 block text-[10px] tracking-wide text-primary">已定</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      {state?.debugStandIn ? (
        <p className="mt-4 text-sm text-muted-foreground">
          试抽：用{state.weekdayName}代替{state.realWeekdayName}。
        </p>
      ) : state?.isWeekend ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {state.weekdayName}不选餐厅。周一到周五才抽午饭。
        </p>
      ) : null}
    </section>
  );
}

function TodayList({
  status,
  state,
  send,
}: {
  status: ConnectionStatus;
  state: PublicState | null;
  send: ReturnType<typeof useRoom>["send"];
}) {
  const today = state?.todayRestaurants ?? EMPTY_RESTAURANTS;
  const weekend = state?.isWeekend ?? false;
  const lockedId = state?.todayPick?.confirmed ? state.todayPick.restaurantId : null;

  return (
    <section className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="mb-4">
        <h2 className="font-heading text-2xl font-semibold">今天的列表</h2>
        <p className="text-sm text-muted-foreground">
          {weekend
            ? "周一会从总列表抄一份，去掉那一周已经选过的餐厅。"
            : "新的一天开始时，从总列表抄一份，去掉这周已经选过的。这桌今天不去的，可以去掉。"}
        </p>
      </div>
      {today.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {weekend ? "今天不抽。" : "今天没有可抽的了。"}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {today.map((restaurant) => (
            <li key={restaurant.id} className="flex items-center justify-between gap-3 py-2">
              <span className="font-heading text-lg font-medium">{restaurant.name}</span>
              {lockedId === restaurant.id ? (
                <span className="px-2.5 text-sm text-primary">已定</span>
              ) : (
              <Button
                type="button"
                variant="ghost"
                disabled={status !== "live"}
                onClick={() => send({ type: "removeFromToday", id: restaurant.id })}
              >
                去掉
              </Button>
              )}
            </li>
          ))}
        </ul>
      )}
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
  const lockedIds = new Set(
    (state?.picks ?? []).filter((pick) => pick.confirmed).map((pick) => pick.restaurantId),
  );

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
    <section className="rounded-3xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
      <div className="mb-4">
        <h2 className="font-heading text-2xl font-semibold">总列表</h2>
        <p className="text-sm text-muted-foreground">
          这桌可能去的所有餐厅。名字会留着，直到有人在这里去掉。今天还没确定时，新加的马上可以抽。
        </p>
      </div>
      {restaurants.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">还没有餐厅。</p>
      ) : (
        <ul className="mb-4 divide-y divide-border">
          {restaurants.map((restaurant) => (
            <li key={restaurant.id} className="flex items-center justify-between gap-3 py-2">
              <span className="font-heading text-lg font-medium">{restaurant.name}</span>
              {lockedIds.has(restaurant.id) ? (
                <span className="px-2.5 text-sm text-primary">已定</span>
              ) : (
              <Button
                type="button"
                variant="ghost"
                disabled={status !== "live"}
                onClick={() => send({ type: "removeRestaurant", id: restaurant.id })}
              >
                去掉
              </Button>
              )}
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
            setLocalError("重新连上之后才能添加。");
            return;
          }
          const trimmed = name.trim();
          setPendingName(trimmed);
          if (!send({ type: "addRestaurant", name })) {
            setPendingName(null);
            setLocalError("重新连上之后才能添加。");
            return;
          }
          setName("");
        }}
      >
        <label className="sr-only" htmlFor="restaurant-name">
          餐厅名字
        </label>
        <Input
          id="restaurant-name"
          value={name}
          maxLength={NAME_LIMIT}
          placeholder="加一家餐厅"
          className="h-11 bg-background text-base"
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setName(event.target.value);
            setLocalError(null);
            setPendingName(null);
          }}
        />
        <Button type="submit" className="h-11 px-5" disabled={status !== "live"}>
          添加
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
