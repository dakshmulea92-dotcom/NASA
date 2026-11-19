import { GoogleGenAI } from '@google/genai';

export interface AnimateImageRequest {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  duration?: '5s' | '8s' | '10s';
}

export interface AnimateImageResult {
  videoBase64: string;
  mimeType: string;
  model: string;
  aspectRatio: '16:9' | '9:16';
}

/**
 * Generates an animated video from an uploaded or captured photo using
 * Google GenAI Interactions API (`ai.interactions.create`) with `gemini-omni-1.2-flash`.
 */
export async function generateVideoFromImage(req: AnimateImageRequest): Promise<AnimateImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. A paid Gemini API key in AI Studio Secrets is required for gemini-omni-1.2-flash video generation.'
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

  const cleanBase64 = req.imageBase64.replace(/^data:[^;]+;base64,/, '');
  const aspectRatio: '16:9' | '9:16' = req.aspectRatio === '9:16' ? '9:16' : '16:9';

  const interaction = await ai.interactions.create(
    {
      model: 'gemini-omni-1.2-flash',
      input: [
        {
          type: 'image',
          mime_type: req.mimeType || 'image/png',
          data: cleanBase64,
        },
        {
          type: 'text',
          text:
            req.prompt?.trim() ||
            'Smooth aerospace mission camera flyover with realistic lunar lighting and subtle motion.',
        },
      ],
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: aspectRatio,
        duration: req.duration || '5s',
        resolution: '720p',
      },
    },
    { timeout: 300000 }
  );

  const videoPart = interaction.output_video;
  if (!videoPart || !videoPart.data) {
    throw new Error(
      'Video model returned no output_video payload. Ensure your configured GEMINI_API_KEY supports paid Interactions API video generation.'
    );
  }

  return {
    videoBase64: videoPart.data,
    mimeType: videoPart.mime_type || 'video/mp4',
    model: 'gemini-omni-1.2-flash',
    aspectRatio,
  };
}
