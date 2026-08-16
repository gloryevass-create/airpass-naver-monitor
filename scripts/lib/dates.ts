export function todayKst(): string {
  // 파이프라인은 KST 기준 하루 단위로 돈다(cron이 KST 새벽에 트리거됨을 전제).
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function daysBeforeKst(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
