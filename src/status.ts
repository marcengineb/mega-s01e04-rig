import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import type { EventCounts } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightStatus = {
  night: string;
  eventCounts: EventCounts | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightStatus[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir).map((night) => ({
    night,
    // The file may disappear after readdirSync. A missing digest must not look like zero events.
    eventCounts: readNight(config.runsDir, night)?.eventCounts ?? null,
  }));

  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
  };
}
