import type { BookingDraft } from "./types";

const API_BASE_URL = "http://127.0.0.1:8765";

export async function getHealth(): Promise<{ ok: boolean; service: string }> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    throw new Error(`Backend health failed: ${response.status}`);
  }
  return response.json();
}

export async function createDraftFromMessage(message: string): Promise<BookingDraft> {
  const response = await fetch(`${API_BASE_URL}/api/booking/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  if (!response.ok) {
    throw new Error(`Draft request failed: ${response.status}`);
  }

  return response.json();
}

