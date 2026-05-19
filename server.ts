import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
  app.post("/api/chat", async (req, res) => {
    try {
      const { history, message, systemInstruction } = req.body;
      
      console.log(`[Chat] Request from user. History length: ${history?.length || 0}`);

      if (!process.env.GEMINI_API_KEY) {
        console.error("[Chat] GEMINI_API_KEY is missing!");
        return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
      }
      
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [
          ...history,
          { role: "user", parts: [{ text: message }] }
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
        model: "gemini-2.0-flash-exp", // Use a more reliable experimental model if 2.5 is not available
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
