const {
  cleanupEnabled,
  cleanupIntervalMinutes
} = require("../config/env");
const { runRecycleCleanupOnce, ensureDefaultPolicies } = require("./recycleService");

function startRecycleScheduler() {
  if (!cleanupEnabled) {
    // eslint-disable-next-line no-console
    console.log("[Recycle] scheduler disabled (CLEANUP_ENABLED=false)");
    return;
  }

  const intervalMs = Math.max(1, Number(cleanupIntervalMinutes) || 60) * 60 * 1000;

  const run = async () => {
    try {
      await runRecycleCleanupOnce();
      // eslint-disable-next-line no-console
      console.log("[Recycle] cleanup completed");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Recycle] cleanup failed:", error.message);
    }
  };

  ensureDefaultPolicies()
    .then(run)
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[Recycle] init failed:", error.message);
    });

  setInterval(run, intervalMs);
  // eslint-disable-next-line no-console
  console.log(`[Recycle] scheduler started. interval=${Math.round(intervalMs / 60000)} minute(s)`);
}

module.exports = { startRecycleScheduler };
