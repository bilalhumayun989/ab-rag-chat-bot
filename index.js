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

const REGIONAL_CONTACTS = {
  "": { phone: "+971 588 3266 70", email: "info@bizaxis.net" },
  "(UAE)": { phone: "+971 54 744 8539", email: "info@bizaxis.net" },
  "(KSA)": { phone: "+971 588 32 6670", email: "info@bizaxis.net" },
  "(UK)": { phone: "+971 54 32 67 320", email: "info@bizaxis.net" },
};

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
      // Include both regional data and general website information
      return doc.metadata.label === label || doc.metadata.label === "(GENERAL)";
    };

    const results = await vectorStore.similaritySearch(message, 6, filter);

    const contextText = results.map(r => r.pageContent).join("\n\n---\n\n");

    // 2. Generate Answer
    const systemPrompt = `
You are the professional and helpful BizAxis AI Assistant for ${label || "BizAxis Global"}.
Your primary goal is to assist users with inquiries related to BizAxis services and business operations in ${label || "the region"}.

### CRITICAL RULES:
1. **Conversational Conversational Logic**: 
   - If the user says "thank you", "thanks", "ok", "got it", "fine", or similar closing/acknowledgment phrases, respond warmly (e.g., "You're very welcome!", "Happy to help!") and ask if there's anything else they need. DO NOT repeat the full service summary.
   - If the user just says "hi", "hello", or "hey", give a brief, warm greeting and ask how you can help them with BizAxis services today.
2. **BizAxis Context**: When the user refers to "this website", "this site", or "you", they are referring to BizAxis.
3. **Relevance Check**: Before answering technical business questions, determine if the topic is related to BizAxis, business, tax, accounting, or professional services.
4. **Professional Refusal**: If the question is COMPLETELY UNRELATED to BizAxis or business (e.g., celebrities, sports, or non-business gossip), respond with: "I'm sorry, my expertise is limited to BizAxis services and business-related inquiries. How can I help you with your business today?"
5. **Engagement Question**: For service or informational queries, ALWAYS provide a natural, context-aware follow-up question. 
   **IMPORTANT**: You MUST separate Part 1 (Answer) and Part 2 (Follow-up Question) using the delimiter '[[FOLLOW_UP]]'.
   Example:
   "BizAxis provides audit services. [[FOLLOW_UP]] Would you like to know about our tax services?"

### HANDLING THE CONTEXT:
- **Strict Adherence**: For technical details, rely ONLY on the Context below.
- **General Info**: Use the documents labeled (GENERAL) to answer questions about the company's identity, owners, mission, and overall service offerings.
- **Handling Unknowns**: If the question is business-related but missing from the context, summarize what BizAxis does generally and ask if they'd like to explore a specific category (e.g., Taxation, Accounting).
- **Professionalism**: Be concise, professional, and clear.

Context:
${contextText}
`;

    const response = await chatModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(message),
    ]);

    // 3. Parse and Structure Response
    const fullContent = response.content;
    const parts = fullContent.split('[[FOLLOW_UP]]');

    const answer = parts[0].trim();
    const raw_follow_up = parts[1] ? parts[1].trim() : "";

    // Determine if we should show follow-up and contact
    const greetings = ["hi", "hello", "hey", "greeting", "morning", "afternoon", "evening", "thank you", "thanks", "ok", "got it"];
    const lowercaseMsg = message.toLowerCase().trim();
    // Consider it a greeting if it's very short and matches a greeting word
    const isGreeting = greetings.some(g => lowercaseMsg === g || lowercaseMsg.startsWith(g + " ") || lowercaseMsg.startsWith(g + "!")) && message.length < 20;

    if (isGreeting) {
      return res.json({ answer });
    }

    const follow_up_text = raw_follow_up || "Is there anything else I can help you with today?";
    const contact = REGIONAL_CONTACTS[label] || REGIONAL_CONTACTS[""];
    const contactInfo = `For more information ${contact.email} : ${contact.phone}`;

    res.json({
      answer,
      follow_up: `${follow_up_text}\n\n${contactInfo}`
    });

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