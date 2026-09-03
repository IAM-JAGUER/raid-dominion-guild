// Helper de Groq (IA) para Netlify Functions.
// Modelo: groq/compound (verificado 2026-09-03; llama-3.3-70b-versatile ya no
// está disponible en esta cuenta). Misma API que guild-portal.
import { env } from './env';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'groq/compound';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqOptions {
  temperature?: number;
  maxTokens?: number;
}

// Llama a Groq con los mensajes dados y devuelve el texto de la respuesta.
export async function groqChat(messages: GroqMessage[], opts: GroqOptions = {}): Promise<string> {
  const apiKey = env('GROQ_API_KEY');
  if (!apiKey) {
    throw new Error('GROQ_API_KEY no configurada');
  }

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens ?? 700,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error de Groq API (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq no devolvió contenido');
  }
  return content.trim();
}