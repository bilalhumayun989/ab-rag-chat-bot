import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import { OpenAIEmbeddings } from "@langchain/openai";

dotenv.config();

const DATA_FILES = [
  { name: "general-info.jsonl", label: "(GENERAL)" },
  { name: "hospital-layouts.jsonl", label: "(HOSPITAL_LAYOUTS)" },
  { name: "home-layouts.jsonl", label: "(HOME_LAYOUTS)" },
  { name: "hotel-layout.jsonl", label: "(HOTEL_LAYOUTS)"  },
  { name: "catalog-ab.jsonl", label: "(CATALOG)"  },
  { name: "bedding.jsonl", label: "(BEDDING)"  },
  { name: "AB_Exports_Production_Capabilities.jsonl", label: "(PRODUCTION_CAPABILITIES)"  }
];

const OUTPUT_FILE = "data/embeddings.json";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY is missing in .env");
    process.exit(1);
  }

  console.log("🚀 Starting embedding generation...");

  const embeddingsModel = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "text-embedding-3-small", // Cost-effective model
  });

  const allDocuments = [];

  for (const fileInfo of DATA_FILES) {
    const filePath = path.join(process.cwd(), fileInfo.name);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ File not found: ${fileInfo.name}. Skipping.`);
      continue;
    }

    console.log(`📄 Processing ${fileInfo.name}...`);
    const fileContent = fs.readFileSync(filePath, "utf8").trim();

    let items = [];
    // Robust parsing: check if it looks like a JSON array first
    if (fileContent.startsWith("[")) {
      try {
        items = JSON.parse(fileContent);
      } catch (err) {
        console.warn(`❌ Invalid JSON array in ${fileInfo.name}:`, err.message);
      }
    } else {
      // Fallback to JSONL
      const lines = fileContent.split("\n").map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          items.push(JSON.parse(line));
        } catch (err) {
          console.warn(`❌ Invalid JSONL in ${fileInfo.name}:`, err.message);
        }
      }
    }

    let count = 0;
    for (const json of items) {
      if (json.prompt && json.completion) {
        const content = `Q: ${json.prompt.trim()}\nA: ${json.completion.trim()}`;
        allDocuments.push({
          pageContent: content,
          metadata: {
            source: fileInfo.name,
            label: fileInfo.label
          }
        });
        count++;
      }
    }
    console.log(`   ✅ Added ${count} items from ${fileInfo.name}`);
  }

  if (allDocuments.length === 0) {
    console.log("⚠️ No documents found to embed.");
    return;
  }

  console.log(`🧠 Generating embeddings for ${allDocuments.length} documents. This may take a moment...`);

  try {
    // LangChain's embedDocuments takes an array of strings
    const texts = allDocuments.map(d => d.pageContent);
    const vectors = await embeddingsModel.embedDocuments(texts);

    // Merge vectors back with content/metadata
    const finalData = allDocuments.map((doc, idx) => ({
      pageContent: doc.pageContent,
      metadata: doc.metadata,
      vector: vectors[idx]
    }));

    // Ensure output dir exists
    const outputDir = path.dirname(path.join(process.cwd(), OUTPUT_FILE));
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(path.join(process.cwd(), OUTPUT_FILE), JSON.stringify(finalData, null, 2));
    console.log(`🎉 Success! Saved ${finalData.length} vectors to ${OUTPUT_FILE}`);
    console.log(`Created file size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);

  } catch (err) {
    console.error("❌ Error generating embeddings:", err);
    process.exit(1);
  }
}

main();
