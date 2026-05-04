import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8765),
  mongodbUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongodbDbName: process.env.MONGODB_DB_NAME ?? "gpb_whatsapp_booking",
  openAiApiKey: process.env.OPENAI_API_KEY ?? ""
};
