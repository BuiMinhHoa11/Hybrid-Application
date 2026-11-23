export interface AdminExamAlert {
  id: string;
  eventId: string;
  createdAt: string;
  sessionId: string;
  examId: string;
  examTitle: string;
  studentId: string;
  username: string;
  fullName: string;
  clientTime: string;
  receivedAt: string;
  readAt: string | null;
  currentStatus: 'outside' | 'fullscreen' | 'ended';
}

export interface AdminFullscreenExit {
  sessionId: string;
  examId: string;
  examTitle: string;
  studentId: string;
  username: string;
  fullName: string;
  exitedAt: string;
  receivedAt: string;
  exitCount: number;
}

export interface AdminAlertSnapshot {
  items: AdminExamAlert[];
  unreadCount: number;
  latestId: string;
  activeSessions: AdminFullscreenExit[];
}
