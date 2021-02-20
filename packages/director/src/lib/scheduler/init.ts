/**
 * This implementation is not friendly for
 * - serverless runtime
 * - multi node setup
 */
import { hookEvents } from '../hooks/hooksEnums';
import { pubsub } from '../pubsub';
import { HookEventPayload } from '../hooks/types';
import { getExecutionDriver } from '@src/drivers';
import { INACTIVITY_TIMEOUT_MS } from '@src/config';
import { emitRunFinish } from '../hooks/events';

const jobs: Record<string, NodeJS.Timeout> = {};

const getInactivityTimeoutHandler = (
  runId: string,
  timeoutMs: number
) => async () => {
  const executionDriver = await getExecutionDriver();

  console.log(
    'Triggered inactivity timeout record for',
    runId,
    'after',
    timeoutMs
  );

  executionDriver
    .setRunInactivityTimeout({
      runId,
      timeoutMs,
    })
    .catch((e) => {
      console.error('Unable to set inactivity timeout', e);
    });
  emitRunFinish({ runId });
};

const handleSchedulerEvent = async ({ runId }: HookEventPayload) => {
  const jobName = `${runId}_inactivity_timeout`;

  if (jobs[jobName]) {
    clearTimeout(jobs[jobName]);
  }

  const executionDriver = await getExecutionDriver();
  const run = await executionDriver.getRunWithSpecs(runId);
  const project = await executionDriver.getProjectById(run.meta.projectId);

  const timeoutMs = project.inactivityTimeoutMs ?? INACTIVITY_TIMEOUT_MS;

  jobs[jobName] = setTimeout(async () => {
    clearTimeout(jobs[jobName]);
    getInactivityTimeoutHandler(runId, timeoutMs)().catch(console.error);
  }, timeoutMs);
};

export async function initScheduler() {
  console.log('🎧 Initializing listeners for scheduler...');
  [hookEvents.RUN_START, hookEvents.INSTANCE_START].forEach((event) => {
    pubsub.on(event, handleSchedulerEvent);
  });
}
