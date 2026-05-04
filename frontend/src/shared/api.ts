import type { BookingDraft, Room } from "./types";

const API_BASE_URL = "http://127.0.0.1:8765";
const LOCAL_ROOMS_STORAGE_KEY = "gpb-booking-rooms";

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

export async function getRooms(): Promise<Room[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/rooms`);
    if (!response.ok) {
      throw new Error(`Rooms request failed: ${response.status}`);
    }
    const rooms = (await response.json()) as Room[];
    await saveLocalRooms(rooms);
    return rooms;
  } catch {
    return getLocalRooms();
  }
}

export async function saveRoom(room: Room): Promise<Room> {
  const localRooms = await getLocalRooms();
  await saveLocalRooms(localRooms.filter((item) => item.id !== room.id).concat(room));

  try {
    const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(room.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(room)
    });

    if (!response.ok) {
      throw new Error(`Room save failed: ${response.status}`);
    }

    return response.json();
  } catch {
    return room;
  }
}

export function getMediaUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

export async function uploadRoomMedia(room: Room, file: File): Promise<Room> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(room.id)}/media`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Media upload failed: ${response.status}`);
  }

  const updatedRoom = (await response.json()) as Room;
  await replaceLocalRoom(updatedRoom);
  return updatedRoom;
}

export async function deleteRoomMedia(room: Room, path: string): Promise<Room> {
  const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(room.id)}/media`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path })
  });

  if (!response.ok) {
    throw new Error(`Media delete failed: ${response.status}`);
  }

  const updatedRoom = (await response.json()) as Room;
  await replaceLocalRoom(updatedRoom);
  return updatedRoom;
}

function getLocalRooms(): Promise<Room[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_ROOMS_STORAGE_KEY], (result) => {
      const rooms = result[LOCAL_ROOMS_STORAGE_KEY];
      resolve(Array.isArray(rooms) ? rooms : []);
    });
  });
}

function saveLocalRooms(rooms: Room[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_ROOMS_STORAGE_KEY]: rooms }, () => resolve());
  });
}

async function replaceLocalRoom(room: Room) {
  const localRooms = await getLocalRooms();
  await saveLocalRooms(localRooms.filter((item) => item.id !== room.id).concat(room));
}
