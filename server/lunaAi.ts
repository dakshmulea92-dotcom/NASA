import { GoogleGenAI } from '@google/genai';

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiContextPayload {
  activePage: string;
  coordinate?: { lat: number; lon: number; name?: string };
  terrainSummary?: Record<string, unknown> | null;
  illuminationSummary?: Record<string, unknown> | null;
  activeMission?: Record<string, unknown> | null;
  datasetsSummary?: string[];
}

export interface AiProvider {
  name: string;
  generateReply(messages: AiChatMessage[], context: AiContextPayload): Promise<string>;
}

const SYSTEM_PROMPT = `You are LUNA AI, the internal scientific and mission-intelligence assistant inside ARC LUNA — LUNASIGHT.

STRICT SCIENTIFIC & PROVENANCE RULES:
1. Ground every numeric measurement in the application's provided telemetry context (NASA LOLA PDS3 DEM, Horn slopes, DE421 solar ephemeris, NASA POWER MERRA-2, Apollo archives).
2. NEVER invent, guess, or fabricate NASA measurements (temperatures, crater depths, slopes, sunlight windows, launch weather, or spacecraft telemetry).
3. If a measurement is missing or not present in the provided context, explicitly state: "NASA DATA UNAVAILABLE in current telemetry context" and explain what NASA dataset would be needed (e.g., LROC NAC stereo DTM for sub-meter boulder hazards, LRO Diviner for high-res bolometric surface temperature).
4. Always distinguish clearly between:
   - Measured NASA observations (e.g. LOLA GDR elevation)
   - Derived calculations (e.g. Horn 3x3 slope, DE421 illumination)
   - Simulated/educational values (e.g. Autonomous Landing Simulator, Rover Simulator, orbital delta-v estimates)
5. Cite the dataset ID and source whenever referencing values from the active context.
6. Keep answers crisp, structured, technical, and directly actionable for aerospace engineers and planetary researchers.`;

class GeminiAiProvider implements AiProvider {
  name = 'Gemini (@google/genai · gemini-4-hydrogen)';

  async generateReply(messages: AiChatMessage[], context: AiContextPayload): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error(
        'GEMINI_API_KEY is not configured. Please configure GEMINI_API_KEY in the Secrets panel.'
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const contextBlock = `ACTIVE APPLICATION TELEMETRY CONTEXT (use ONLY these factual values when citing live app data):
${JSON.stringify(context, null, 2)}`;

    const conversation = messages
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'USER' : 'LUNA_AI'}: ${m.content}`)
      .join('\n\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `${contextBlock}\n\nCONVERSATION:\n${conversation}\n\nProvide a scientifically grounded response as LUNA AI:`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    return response.text ?? 'Unable to generate a response from the AI model.';
  }
}

// Modular provider registry so AI backend can be swapped without rebuilding the app
let activeProvider: AiProvider = new GeminiAiProvider();

export function getAiProvider(): AiProvider {
  return activeProvider;
}

export function setAiProvider(provider: AiProvider) {
  activeProvider = provider;
}
