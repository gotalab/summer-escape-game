export function clockToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function secondsToClock(seconds: number): string {
  const normalized = ((Math.round(seconds) % 86400) + 86400) % 86400;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

export function todayInJapan(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
}

export type JapanDateChoice = "today" | "tomorrow" | "weekend";

function addCalendarDays(date: string, days: number): string {
  // Noon UTC keeps the calendar calculation independent of the machine's
  // timezone and avoids daylight-saving transitions in non-Japan test hosts.
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Returns the calendar date selected by the service, always in JST. */
export function dateForJapan(choice: JapanDateChoice, now = new Date()): string {
  const today = todayInJapan(now);
  if (choice === "today") return today;
  if (choice === "tomorrow") return addCalendarDays(today, 1);
  // `today` is already a JST calendar value. Read its weekday at UTC noon so
  // `getUTCDay()` cannot slide back into the previous UTC day.
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addCalendarDays(today, (6 - weekday + 7) % 7);
}

/** Compact, explicit date label for controls that otherwise only say "today". */
export function formatJapanDate(date: string): string {
  const value = new Date(`${date}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(value);
}

export function timeInJapan(now = new Date()): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return {
    hours: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
    minutes: Number(parts.find((part) => part.type === "minute")?.value ?? 0),
  };
}
