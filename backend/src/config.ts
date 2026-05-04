import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8765),
  databasePath: process.env.DATABASE_PATH ?? "./data/bookings.sqlite",
  openAiApiKey: process.env.OPENAI_API_KEY ?? ""
};

