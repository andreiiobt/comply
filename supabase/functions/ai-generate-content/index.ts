import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Google AI Gemini API — direct, no proxy
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";

const analyzeTools = [
  {
    type: "function",
    function: {
      name: "generate_questions",
      description: "Return 3-5 questions to ask the admin so we can tailor the generated lesson content.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                question: { type: "string" },
                type: { type: "string", enum: ["text", "select"] },
                options: {
                  type: "array",
                  items: { type: "string" },
                  description: "Only for select type",
                },
              },
              required: ["id", "question", "type"],
            },
          },
        },
        required: ["questions"],
      },
    },
  },
];

const generateTools = [
  {
    type: "function",
    function: {
      name: "generate_blocks",
      description:
        "Return an array of lesson content blocks. Each block must follow the lesson_content schema exactly.",
      parameters: {
        type: "object",
        properties: {
          blocks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                block_type: {
                  type: "string",
                  enum: [
                    "section",
                    "card",
                    "question",
                    "callout",
                    "fill_blank",
                    "matching",
                    "flashcard",
                    "accordion",
                    "numbered_steps",
                  ],
                },
                title: { type: "string" },
                content: { type: "string", description: "HTML content for cards/sections, question text for questions" },
                question_type: {
                  type: "string",
                  enum: ["multiple_choice", "true_false", "free_text"],
                  description: "Only for question blocks",
                },
                options: {
                  description:
                    "For questions: string[] of choices. For matching: {left,right}[]. For accordion: {header,body}[]. For callout: [variant]. For numbered_steps: {step,content}[].",
                },
                correct_answer: {
                  type: "string",
                  description: "Correct answer for question/fill_blank blocks",
                },
              },
              required: ["block_type", "title"],
            },
          },
        },
        required: ["blocks"],
      },
    },
  },
];

/**
 * Call Google Gemini API using the OpenAI-compatible endpoint.
 * Google provides this at /v1beta/openai/ for easy migration.
 */
async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  tools: any[],
  toolChoice: string,
): Promise<any> {
  // Use Google's OpenAI-compatible endpoint for minimal code change
  const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools,
      tool_choice: { type: "function", function: { name: toolChoice } },
    }),
  });

  if (!res.ok) {
    const status = res.status;
    const txt = await res.text();
    console.error("Gemini API error:", status, txt);
    if (status === 429) {
      throw { status: 429, message: "Rate limited, please try again shortly." };
    }
    if (status === 403) {
      throw { status: 403, message: "API key does not have access. Check your Google AI API key." };
    }
    throw new Error(`Gemini API error [${status}]: ${txt}`);
  }

  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { phase, documentText, prompt, answers } = await req.json();
    const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");

    if (phase === "analyze") {
      const systemPrompt = `You are an expert instructional designer. You've been given text extracted from a document. Analyze it and generate 3-5 tailored questions to ask the course administrator so you can create the best possible lesson content. Questions should cover: target audience, key topics to emphasize, difficulty level, and content style preferences.`;

      const userPrompt = `Document text:\n\n${documentText.slice(0, 30000)}\n\n${prompt ? `Admin's note: ${prompt}` : ""}`;

      const data = await callGemini(apiKey, systemPrompt, userPrompt, analyzeTools, "generate_questions");
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      const questions = JSON.parse(toolCall.function.arguments).questions;

      return new Response(JSON.stringify({ questions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (phase === "generate") {
      const systemPrompt = `You are an expert instructional designer creating lesson content blocks for an LMS.

Rules:
- Create a mix of informational blocks (section headers, cards with rich HTML content, callouts for key warnings/tips) and graded assessment blocks (multiple_choice questions, fill_blank, matching exercises).
- For "card" blocks, use rich HTML in the "content" field (paragraphs, bold, lists).
- For "question" blocks with question_type "multiple_choice", provide exactly 4 options as a string array and set correct_answer to the exact matching option text.
- For "fill_blank" blocks, put the sentence with a blank as "___" in content and the answer in correct_answer.
- For "matching" blocks, options should be an array of {left, right} objects.
- For "callout" blocks, options should be a single-element array with the variant: "info", "warning", "tip", or "success".
- For "accordion" blocks, options should be an array of {header, body} objects.
- For "numbered_steps" blocks, options should be an array of {step, content} objects.
- Start with a section header, then alternate between info content and assessment blocks.
- Generate 8-15 blocks total for a comprehensive lesson.
- Ensure questions directly test comprehension of the document content.`;

      const answersText = Object.entries(answers as Record<string, string>)
        .map(([q, a]) => `Q: ${q}\nA: ${a}`)
        .join("\n\n");

      const userPrompt = `Document text:\n\n${documentText.slice(0, 30000)}\n\nAdmin preferences:\n${answersText}`;

      const data = await callGemini(apiKey, systemPrompt, userPrompt, generateTools, "generate_blocks");
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      const blocks = JSON.parse(toolCall.function.arguments).blocks;

      return new Response(JSON.stringify({ blocks }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid phase" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ai-generate-content error:", e);
    const status = e?.status || 500;
    const message = e instanceof Error ? e.message : e?.message || "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
