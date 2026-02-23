import OpenAI from "openai";
import { z } from "zod";
import { AIClient } from "./ai-client.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const aiCallback = async ({ prompt, temperature }) => {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature,
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content;
};

const ai = new AIClient({
  aiCallback,
});

// 👇 Prompt + Schema together
const result = await ai.generateStructured({
  prompt: `
Return a JSON object with:
- name
- age
- email

The person must be fictional.
Return ONLY valid JSON.
  `,
  schema: z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email(),
  }),
});

console.log(result);
