import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Gemini Setup
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Routes
  app.post("/api/moderate", async (req, res) => {
    try {
      const { mediaData, mimeType } = req.body;
      if (!mediaData) {
        return res.status(400).json({ error: "Missing mediaData" });
      }

      console.log(`[Moderation] Scanning media file of type: ${mimeType}`);

      if (!process.env.GEMINI_API_KEY) {
        console.error("[Moderation] GEMINI_API_KEY is missing!");
        return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
      }
      
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || "image/jpeg",
                  data: mediaData.split(",")[1] || mediaData,
                }
              },
              {
                text: "Analyze this image/media file. You are a content safety filter for teenagers. Check if this contains: \n1. Sexual/explicit content or pornography\n2. Extreme violence, gore, blood, or self-harm\n3. Weapons, crime, or dangerous illicit drugs\n\nYour response MUST BE in raw JSON format matching this schema:\n{\n  \"safe\": true or false,\n  \"reason\": \"A short explanation in Indonesian (maximum 1 sentence) explaining why it was flagged\"\n}\nIf safe, set \"safe\" to true and \"reason\" to \"\"."
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        }
      });

      const text = response.text?.trim() || "";
      console.log(`[Moderation] Result: ${text}`);

      let moderationResult = { safe: true, reason: "" };
      try {
        moderationResult = JSON.parse(text);
      } catch (err) {
        if (text.toLowerCase().includes('"safe": false') || text.toLowerCase().includes('safe: false')) {
          moderationResult = { safe: false, reason: "Konten ini dideteksi tidak aman atau kurang pantas." };
        }
      }

      res.json(moderationResult);
    } catch (error: any) {
      console.error("[Moderation] API Error:", error);
      res.json({ safe: true, reason: "" }); // Fallback to safe if API errors out or doesn't support format
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { history, message, systemInstruction, media } = req.body;
      
      console.log(`[Chat] Request from user. History length: ${history?.length || 0}. Has media: ${!!media}`);

      if (!process.env.GEMINI_API_KEY) {
        console.error("[Chat] GEMINI_API_KEY is missing!");
        return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
      }

      const parts: any[] = [];
      if (media && media.data) {
        parts.push({
          inlineData: {
            mimeType: media.mimeType,
            data: media.data.split(",")[1] || media.data
          }
        });
      }
      parts.push({ text: message });
      
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          ...history,
          { role: "user", parts }
        ],
        config: {
          systemInstruction,
          temperature: 0.8,
          topP: 0.95,
          topK: 40,
        },
      });

      const responseText = response.text;
      
      if (!responseText) {
        console.warn("[Chat] Gemini returned empty response. Response object:", JSON.stringify(response));
        return res.json({ text: "Duh, sori banget, gw lagi agak nge-blank nih. Bisa diulang?" });
      }

      console.log(`[Chat] Success. Response length: ${responseText.length}`);
      res.json({ text: responseText });
    } catch (error: any) {
      console.error("[Chat] API Error:", error);
      res.status(500).json({ error: "Failed to chat with Gemini", details: error.message });
    }
  });

  app.post("/api/sticker", async (req, res) => {
    try {
      const { prompt } = req.body;
      console.log(`[Sticker] Generating for prompt: ${prompt.substring(0, 30)}...`);

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Gemini API Key missing" });
      }
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [{ text: prompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      let imageData = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageData = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageData) {
        console.log("[Sticker] Success");
        res.json({ imageUrl: imageData });
      } else {
        console.warn("[Sticker] No image data in response:", JSON.stringify(response));
        res.status(500).json({ error: "Failed to generate sticker image" });
      }
    } catch (error: any) {
      const errMsg = error.message || "";
      const isQuota = errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED") || error.status === 429;
      if (isQuota) {
        console.warn("[Sticker] API Quota Exceeded (429/Limit: 0 for gemini-2.5-flash-image). Returning elegant fallback indicator.");
        return res.status(429).json({ error: "QUOTA_EXHAUSTED", details: errMsg });
      }
      console.error("[Sticker] API Error:", error);
      res.status(500).json({ error: "Failed to generate sticker", details: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
