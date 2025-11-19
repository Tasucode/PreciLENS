import { GoogleGenAI, Type } from "@google/genai";

const MODEL_ID = "gemini-3-pro-preview";

export interface DetectedTextRegion {
  box_2d: [number, number, number, number]; // ymin, xmin, ymax, xmax (0-1000)
  text: string;
  translation: string;
  confidence: number;
  alignment?: "left" | "center" | "right";
}

export const analyzeImage = async (base64Image: string): Promise<DetectedTextRegion[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("No API Key found. Returning empty analysis.");
    return [];
  }

  const ai = new GoogleGenAI({ apiKey });

  // Detect mime type from the base64 header if present
  const mimeTypeMatch = base64Image.match(/^data:(image\/[a-zA-Z+]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

  const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");

  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64
            }
          },
          {
            text: `You are a specialized document layout analysis engine.
            
            TASK:
            Analyze the Purchase Order or Form image.
            1. **Structure Detection**: Identify the boundaries of table cells or text blocks. IMPORTANT: Your bounding boxes should be LOOSE. Include the surrounding whitespace of the cell so the entire background can be erased cleanly.
            2. **Alignment**: Detect if the column is Left, Center, or Right aligned.
            3. **Content**: Translate the text to English. Keep it concise to fit the layout (e.g. "Material Description" -> "Mat. Desc" if very tight).
            4. **Grouping**: Group all text lines within a single visual cell into one region.

            Return a JSON array.`
          }
        ]
      },
      config: {
        systemInstruction: "You are a professional translator specializing in technical forms. Prioritize clean layout preservation.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              box_2d: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "ymin, xmin, ymax, xmax coordinates (0-1000)"
              },
              text: { type: Type.STRING },
              translation: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              alignment: { 
                type: Type.STRING, 
                enum: ["left", "center", "right"] 
              }
            },
            required: ["box_2d", "translation", "confidence", "alignment"]
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as DetectedTextRegion[];
    }
    return [];

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};