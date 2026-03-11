import OpenAI from "openai";
import fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
    console.log("Starting fine-tuning process...");

    // 1. Upload the training file
    console.log("Uploading training data...");
    const file = await openai.files.create({
        file: fs.createReadStream("data.jsonl"),
        purpose: "fine-tune",
    });

    console.log(`File uploaded. ID: ${file.id}`);

    // 2. Create a fine-tuning job
    console.log("Creating fine-tuning job...");
    const fineTune = await openai.fineTuning.jobs.create({
        training_file: file.id,
        model: "gpt-4o-mini-2024-07-18",
    });

    console.log(`Fine-tuning job created. ID: ${fineTune.id}`);
    console.log("You can monitor the progress in the OpenAI dashboard: https://platform.openai.com/finetune");
}

main().catch((err) => {
    console.error("Error during fine-tuning:", err);
});
