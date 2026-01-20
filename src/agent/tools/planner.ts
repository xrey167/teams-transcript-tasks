// src/agent/tools/planner.ts
import { getGraphClient } from '../../utils/graphClient.js';
import type { PlannerPlan, PlannerTask, PlannerAssignment } from '../../types/index.js';

export async function getUserPlans(userId: string): Promise<PlannerPlan[]> {
  const client = await getGraphClient();

  const result = await client
    .api(`/users/${userId}/planner/plans`)
    .get();

  return (result.value || []).map((p: any) => ({
    id: p.id,
    title: p.title,
    owner: p.owner
  }));
}

/**
 * Gets a user's personal plan for task assignment.
 * Looks for a plan named "{displayName}'s Tasks" first, then falls back to first available plan.
 * Note: Plan creation is not supported (requires Microsoft 365 Group creation).
 */
export async function getPersonalPlan(userId: string, userDisplayName: string): Promise<PlannerPlan> {
  const plans = await getUserPlans(userId);
  const personalPlanTitle = `${userDisplayName}'s Tasks`;

  // Look for personal tasks plan first
  const existing = plans.find(p => p.title === personalPlanTitle);
  if (existing) {
    return existing;
  }

  // Fall back to first available plan
  if (plans.length > 0) {
    return plans[0];
  }

  throw new Error(`No Planner plans found for user ${userId}. Please create a plan in Microsoft Planner first.`);
}

export async function getPlanBuckets(planId: string): Promise<Array<{ id: string; name: string }>> {
  const client = await getGraphClient();

  const result = await client
    .api(`/planner/plans/${planId}/buckets`)
    .get();

  return (result.value || []).map((b: any) => ({
    id: b.id,
    name: b.name
  }));
}

export async function createTask(
  planId: string,
  title: string,
  assigneeIds: string[],
  dueDateTime?: string,
  description?: string
): Promise<PlannerTask> {
  const client = await getGraphClient();

  // Build assignments object
  const assignments: Record<string, PlannerAssignment> = {};
  for (const userId of assigneeIds) {
    assignments[userId] = {
      odataType: '#microsoft.graph.plannerAssignment',
      orderHint: ' !'
    };
  }

  const taskData: any = {
    planId,
    title,
    assignments
  };

  if (dueDateTime) {
    taskData.dueDateTime = dueDateTime;
  }

  const task = await client
    .api('/planner/tasks')
    .post(taskData);

  // Add description if provided
  if (description && task.id) {
    await updateTaskDetails(task.id, description);
  }

  return {
    id: task.id,
    planId: task.planId,
    title: task.title,
    assignments: task.assignments,
    dueDateTime: task.dueDateTime
  };
}

async function updateTaskDetails(taskId: string, description: string): Promise<void> {
  const client = await getGraphClient();

  // Get current etag
  const details = await client
    .api(`/planner/tasks/${taskId}/details`)
    .get();

  await client
    .api(`/planner/tasks/${taskId}/details`)
    .header('If-Match', details['@odata.etag'])
    .patch({
      description
    });
}

export async function addTaskAssignees(taskId: string, assigneeIds: string[]): Promise<void> {
  const client = await getGraphClient();

  // Get current task with etag
  const task = await client
    .api(`/planner/tasks/${taskId}`)
    .get();

  const newAssignments: Record<string, PlannerAssignment> = { ...task.assignments };
  for (const userId of assigneeIds) {
    if (!newAssignments[userId]) {
      newAssignments[userId] = {
        odataType: '#microsoft.graph.plannerAssignment',
        orderHint: ' !'
      };
    }
  }

  await client
    .api(`/planner/tasks/${taskId}`)
    .header('If-Match', task['@odata.etag'])
    .patch({
      assignments: newAssignments
    });
}
