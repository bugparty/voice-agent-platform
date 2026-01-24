export type UiEvent = {
  id: string;
  ts: number;
  category: string;
  level: string;
  payload: Record<string, unknown>;
};

export function createEventStream(
  baseUrl: string,
  onEvent: (event: UiEvent) => void
) {
  const source = new EventSource(`${baseUrl}/events`);
  source.onmessage = (message) => {
    try {
      const data = JSON.parse(message.data) as UiEvent;
      onEvent(data);
    } catch (error) {
      // ignore malformed events
    }
  };

  return () => source.close();
}
