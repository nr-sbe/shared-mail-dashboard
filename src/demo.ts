import type { Feed } from './types';

export function demoFeed(): Feed {
  const now = Date.now();
  const items = [
    ['operations', 'Operations', 'Dispatch <dispatch@example.com>', 'Delivery update: revised arrival window', 'Hello team,\n\nThe next delivery is now expected between 10:00 AM and 12:00 PM tomorrow. The driver will check in at the main entrance on arrival.\n\nPlease make sure the receiving area is clear before 10:00 AM.\n\nThank you,\nDispatch team', 0.2],
    ['projects', 'Projects', 'Project desk <projects@example.com>', 'Weekly project update is ready', 'Hi everyone,\n\nThis week’s project update is ready for review. All scheduled milestones are on track.\n\nNext steps:\n• Review the updated schedule.\n• Confirm availability for the site visit.\n• Send any outstanding questions to the project desk.\n\nRegards,\nProject desk', 1.5],
    ['operations', 'Operations', 'Site coordination <site@example.com>', 'Site notice: entrance change on Monday', 'The north entrance will be closed for maintenance on Monday. Please use the east entrance for all deliveries and visitor access.\n\nNormal access resumes on Tuesday morning.\n\nSite coordination', 3],
    ['scheduling', 'Scheduling', 'Planning team <planning@example.com>', 'Schedule confirmation: Thursday walkthrough', 'The Thursday walkthrough is confirmed for 9:30 AM.\n\nMeeting point: main reception.\nExpected duration: 45 minutes.\n\nPlease arrive five minutes early.\n\nPlanning team', 7],
    ['projects', 'Projects', 'Project desk <projects@example.com>', 'Review complete: updated milestone dates', 'The review is complete and the revised dates have been accepted.\n\nThere are no changes to this week’s activities. The next status update will include the adjusted milestones.\n\nThank you for the quick turnaround.', 25],
    ['scheduling', 'Scheduling', 'Planning team <planning@example.com>', 'Reminder: availability for next week', 'Please confirm your availability for next week’s coordination meeting by the end of the day.\n\nWe will share the final time once everyone has responded.\n\nThank you!', 49],
  ] as const;
  return {
    serverTime: new Date(now).toISOString(),
    sources: [{ id: 'operations', label: 'Operations' }, { id: 'projects', label: 'Projects' }, { id: 'scheduling', label: 'Scheduling' }],
    messages: items.map(([sourceId, sourceLabel, sender, subject, body, hours], i) => ({
      id: `sample-${i}`, sourceId, sourceLabel, sender, subject, body,
      receivedAt: new Date(now - hours * 3600000).toISOString(),
      expiresAt: new Date(now + (72 - hours) * 3600000).toISOString(),
    })),
  };
}
