import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import * as dotenv from "dotenv";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

/* ------------------ RAG Setup ------------------ */
let vectorStore = null;

async function loadVectorStore() {
  try {
    const filePath = path.join(process.cwd(), "data", "embeddings.json");
    if (!fs.existsSync(filePath)) {
      console.warn("⚠️ embeddings.json not found. Run 'npm run generate-embeddings' first.");
      return;
    }

    console.log("Loading embeddings...");
    const rawData = JSON.parse(fs.readFileSync(filePath, "utf8"));
    
    // rawData is array of { pageContent, metadata, vector }
    // MemoryVectorStore.fromExistingIndex is not standard in JS Langchain the same way, 
    // but we can construct it manually or use a simple addVectors.
    // However, the standard way in JS MemoryVectorStore is to just add documents.
    // We already have vectors! 
    // Optimization: avoid re-embedding. MemoryVectorStore allows adding vectors directly.
    
    const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "text-embedding-3-small", 
    });

    vectorStore = new MemoryVectorStore(embeddings);
    
    // Add vectors directly
    const vectors = rawData.map(d => d.vector);
    const documents = rawData.map(d => ({ pageContent: d.pageContent, metadata: d.metadata }));
    
    await vectorStore.addVectors(vectors, documents);
    
    console.log(`✅ Vector Store loaded with ${documents.length} entries.`);
    
  } catch (err) {
    console.error("❌ Failed to load vector store:", err);
  }
}

// Load on start
loadVectorStore();

/* ------------------ OpenAI Model ------------------ */
const chatModel = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-4o-mini",
  temperature: 0.5,
});

/* ------------------ Chat Handler ------------------ */
async function chatHandler(req, res, label) {
  const { message } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!vectorStore) {
      return res.status(503).json({ error: "Server is initializing or missing embeddings." });
  }

  try {
    // 1. Retrieve relevant documents
    // Filter by label if needed. The label is like "(KSA)", "(UK)". 
    // If label is empty string, it might mean "Default" or "All"? 
    // Previous code: contextDefault was data.jsonl (no label in script?), UK was data-uk etc.
    // In generate-embeddings.js: 
    // data.jsonl -> label: ""
    // data-uk.jsonl -> label: "(UK)"
    
    const filter = (doc) => {
        // If the endpoint is specific (e.g. UK), strictly filter for that source label.
        // If label is "", we might want only the default data OR maybe all data?
        // Original logic: /chat -> contextDefault (data.jsonl only).
        // /chat/uk -> contextUK (data-uk.jsonl only).
        // So strict filtering is correct.
        return doc.metadata.label === label;
    };

    const results = await vectorStore.similaritySearch(message, 4, filter);
    
    const contextText = results.map(r => r.pageContent).join("\n\n---\n\n");
    
    // 2. Generate Answer
    const systemPrompt = `
You are an intelligent and professional consultant for BizAxis ${label}.
Your goal is to provide accurate, helpful answers based STRICTLY on the context provided below.

Guidelines:
1. **Strict Context Adherence**: valid answers must come ONLY from the "Context" section below. Do not use outside general knowledge to answer specific business questions.
2. **Handle Unknowns**: If the answer is not present in the context, politely state: "I'm sorry, I don't have enough information in my records to answer that specific question. Could you please provide more details or ask about [mention a related topic from context]?"
3. **Clarification**: If the user's question is vague, ambiguous, or lacks detail, DO NOT GUESS. Instead, ask a specific counter-question to understand their needs better.
4. **Professionalism**: Be concise, professional, and clear.

Context:
${contextText}
`;

    const response = await chatModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(message),
    ]);

    res.json({ reply: response.content });

  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/* ------------------ Routes ------------------ */
app.post("/chat", (req, res) => chatHandler(req, res, ""));
app.post("/chat/uk", (req, res) => chatHandler(req, res, "(UK)"));
app.post("/chat/uae", (req, res) => chatHandler(req, res, "(UAE)"));
app.post("/chat/ksa", (req, res) => chatHandler(req, res, "(KSA)"));

/* ------------------ Health check ------------------ */
app.get("/check/api", (req, res) => {
  res.send("✅ API is working perfect (RAG Enabled)");
});

/* ------------------ Start server locally ------------------ */
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

/* ------------------ Export for Vercel ------------------ */
export default app;


