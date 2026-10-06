// Helper de Groq (IA) para Netlify Functions.
// Modelo: openai/gpt-oss-120b (verificado 2026-10-06; antes groq/compound y
// llama-3.3-70b-versatile, ambos retirados de la cuenta — la disponibilidad
// rota). Se puede sobreescribir con la env GROQ_MODEL sin redeployar. Misma
// API que guild-portal.
//
// ⚠️ gpt-oss es un modelo de razonamiento: consume del presupuesto de
// max_tokens antes del contenido final (observado ~1000-1900 tokens), por eso
// el default es alto. Con presupuestos bajos Groq corta en 'length' y el
// contenido llega vacío.
import { env } from './env';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function defaultModel(): string {
  return env('GROQ_MODEL') || 'openai/gpt-oss-120b';
}

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
      model: defaultModel(),
      messages,
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens ?? 1500,
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