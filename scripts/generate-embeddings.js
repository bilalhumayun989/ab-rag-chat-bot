import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import { OpenAIEmbeddings } from "@langchain/openai";

dotenv.config();

const DATA_FILES = [
  { name: "data.jsonl", label: "" },
  { name: "data-uk.jsonl", label: "(UK)" },
  { name: "data-uae.jsonl", label: "(UAE)" },
  { name: "data-ksa.jsonl", label: "(KSA)" },
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
    const fileContent = fs.readFileSync(filePath, "utf8");
    const lines = fileContent.split("\n").map(l => l.trim()).filter(Boolean);

    let count = 0;
    for (const line of lines) {
        try {
            const json = JSON.parse(line);
            const content = `Q: ${json.prompt.trim()}\nA: ${json.completion.trim()}`;
            
            // We store the vector later, for now we prepare the doc logic
            // Actually, we can just generate vectors in batches or one by one.
            // For simplicity and standard format, let's create a structure we can load easily.
            allDocuments.push({
                pageContent: content,
                metadata: {
                    source: fileInfo.name,
                    label: fileInfo.label
                }
            });
            count++;
        } catch (err) {
            console.warn(`❌ Invalid JSON in ${fileInfo.name}:`, err.message);
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
