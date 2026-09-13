export interface Message {
  id: string;
  sourceId: string;
  sourceLabel: string;
  sender: string;
  subject: string;
  body: string;
  receivedAt: string;
  expiresAt: string;
}
export interface Feed {
  messages: Message[];
  sources: { id: string; label: string }[];
  serverTime: string;
}
