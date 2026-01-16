// src/types/index.ts

// Microsoft Graph types
export interface MeetingTranscript {
  id: string;
  meetingId: string;
  content: string;
  createdDateTime: string;
}

export interface MeetingParticipant {
  id: string;
  displayName: string;
  email: string;
}

export interface Meeting {
  id: string;
  subject: string;
  organizer: MeetingParticipant;
  participants: MeetingParticipant[];
  startDateTime: string;
  endDateTime: string;
}

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

// Planner types
export interface PlannerPlan {
  id: string;
  title: string;
  owner: string;
}

export interface PlannerTask {
  id?: string;
  planId: string;
  bucketId?: string;
  title: string;
  assignments: Record<string, PlannerAssignment>;
  dueDateTime?: string;
  details?: {
    description: string;
  };
}

export interface PlannerAssignment {
  odataType: string;
  orderHint: string;
}

// Task extraction types
export interface ExtractedTask {
  title: string;
  assigneeName: string;
  assigneeEmail?: string;
  dueDate?: string;
  description: string;
  confidence: number;
  meetingContext: {
    meetingId: string;
    meetingSubject: string;
  };
}

export interface ReviewTask extends ExtractedTask {
  id: string;
  suggestedAssignees: Array<{
    user: GraphUser;
    confidence: number;
  }>;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
}

// Webhook types
export interface GraphWebhookNotification {
  subscriptionId: string;
  changeType: string;
  resource: string;
  resourceData: {
    id: string;
    odataType: string;
  };
  clientState: string;
}

export interface WebhookSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState: string;
}

// Config types
export interface AppConfig {
  oversightPerson: string;
  confidenceThreshold: number;
  autoCreateHighConfidence: boolean;
  rules: {
    ignorePatterns: string[];
    alwaysInclude: string[];
  };
}

// Token types
export interface TokenCache {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
