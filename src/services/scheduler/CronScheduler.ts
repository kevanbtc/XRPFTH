// Placeholder for a cron job scheduler
// This service would manage scheduled tasks like:
// - Daily bonus runs
// - Daily PoR snapshots
// - Reconciliation jobs

export class CronScheduler {
  private schedules: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    console.log('CronScheduler initialized.');
  }

  scheduleDailyBonusRun(time: string, callback: () => void) {
    const jobName = 'dailyBonusRun';
    console.log(`Scheduling daily bonus run for ${time}`);
    // In a real system, use a robust cron library (e.g., node-cron)
    // For now, a simple setTimeout to simulate a daily event after a delay
    const delay = this.calculateDelayUntil(time);
    this.schedules.set(jobName, setTimeout(() => {
      console.log(`Executing ${jobName} at ${new Date().toISOString()}`);
      callback();
      // Reschedule for the next day
      this.scheduleDailyBonusRun(time, callback);
    }, delay));
  }

  scheduleDailyPoRSnapshot(time: string, callback: () => void) {
    const jobName = 'dailyPoRSnapshot';
    console.log(`Scheduling daily PoR snapshot for ${time}`);
    const delay = this.calculateDelayUntil(time);
    this.schedules.set(jobName, setTimeout(() => {
      console.log(`Executing ${jobName} at ${new Date().toISOString()}`);
      callback();
      this.scheduleDailyPoRSnapshot(time, callback);
    }, delay));
  }

  scheduleReconciliationJob(intervalMinutes: number, callback: () => void) {
    const jobName = 'reconciliationJob';
    console.log(`Scheduling reconciliation job every ${intervalMinutes} minutes`);
    this.schedules.set(jobName, setInterval(() => {
      console.log(`Executing ${jobName} at ${new Date().toISOString()}`);
      callback();
    }, intervalMinutes * 60 * 1000));
  }

  private calculateDelayUntil(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

    if (target.getTime() < now.getTime()) {
      target.setDate(target.getDate() + 1); // Schedule for next day if time has passed today
    }
    return target.getTime() - now.getTime();
  }

  stopAllSchedules() {
    this.schedules.forEach((timeout) => {
      clearTimeout(timeout);
      clearInterval(timeout);
    });
    this.schedules.clear();
    console.log('All scheduled jobs stopped.');
  }
}
