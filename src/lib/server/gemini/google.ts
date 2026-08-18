import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { GeminiGateway, ImageResult, PromptItem, PromptListResult, TextResult } from "./gateway";

const promptItemsSchema = z.array(
  z.object({
    name: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
  }),
);

const promptSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["name", "prompt"],
    properties: {
      name: { type: "string" },
      prompt: { type: "string" },
    },
  },
};

const imageRules = [
  "Produce one coherent illustration only.",
  "Do not add text, captions, labels, typography, borders, covers, panels, grids, or collages.",
  "Keep the named characters visually consistent across every image.",
].join(" ");

export class GoogleGeminiGateway implements GeminiGateway {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly textModel: string,
    private readonly imageModel: string,
  ) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required to run pipeline steps.");
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 5 * 60_000,
        retryOptions: { attempts: 1 },
      },
    });
  }

  async uploadBook(filePath: string) {
    const file = await this.client.files.upload({
      file: filePath,
      config: { mimeType: "text/plain", displayName: "Book source" },
    });
    if (!file.name || !file.uri) throw new Error("Gemini did not return an uploaded file identity.");
    return { name: file.name, uri: file.uri };
  }

  async startBook(fileUri: string): Promise<string> {
    const interaction = await this.client.interactions.create({
      model: this.textModel,
      input: [
        {
          type: "text",
          text: "Here is a book to illustrate using Nano Banana. Do not analyze it yet; instructions will follow.",
        },
        { type: "document", uri: fileUri, mime_type: "text/plain" },
      ],
    });
    return this.requireId(interaction.id);
  }

  async generateStyle(previousInteractionId: string, requestedStyle?: string): Promise<TextResult> {
    const prompt = requestedStyle
      ? `The art style is: "${requestedStyle}". Preserve this direction in future prompts. Return only the cleaned art-style prompt.`
      : "Define an art style that fits this story but has a distinctive twist. Return only the reusable art-style prompt.";
    const interaction = await this.client.interactions.create({
      model: this.textModel,
      input: prompt,
      previous_interaction_id: previousInteractionId,
    });
    return {
      interactionId: this.requireId(interaction.id),
      text: this.requireText(interaction.output_text),
    };
  }

  async generateCharacters(previousInteractionId: string): Promise<PromptListResult> {
    return this.generatePromptList(
      previousInteractionId,
      "Describe the main characters, adults only, using details from the book. Return at most 2. Each image prompt should be specific and at least 50 words so Nano Banana can create a consistent portrait.",
      2,
    );
  }

  async startImageContext(title: string, style: string): Promise<string> {
    const interaction = await this.client.interactions.create({
      model: this.imageModel,
      input: `You are illustrating "${title}". Art style: ${style}. ${imageRules}`,
    });
    return this.requireId(interaction.id);
  }

  async generatePortrait(previousInteractionId: string, character: PromptItem): Promise<ImageResult> {
    return this.generateImage(
      previousInteractionId,
      `Create a portrait illustration of ${character.name}. Description: ${character.prompt}. ${imageRules}`,
      "9:16",
    );
  }

  async generateChapters(previousInteractionId: string): Promise<PromptListResult> {
    return this.generatePromptList(
      previousInteractionId,
      "Create one chapter illustration prompt for this book. It must describe a single scene, name every character shown, and reuse their established character descriptions in detail. Return at most 1 chapter.",
      1,
    );
  }

  async startChapterImageContext(previousInteractionId: string): Promise<string> {
    const interaction = await this.client.interactions.create({
      model: this.imageModel,
      previous_interaction_id: previousInteractionId,
      input: `Now illustrate the book chapter. Refer to the prior portraits for character consistency while allowing new poses and composition. ${imageRules}`,
    });
    return this.requireId(interaction.id);
  }

  async generateIllustration(previousInteractionId: string, chapter: PromptItem): Promise<ImageResult> {
    return this.generateImage(
      previousInteractionId,
      `Create an illustration for ${chapter.name} using the previously generated characters. Scene: ${chapter.prompt}. ${imageRules}`,
      "16:9",
    );
  }

  private async generatePromptList(
    previousInteractionId: string,
    input: string,
    maxItems: number,
  ): Promise<PromptListResult> {
    const interaction = await this.client.interactions.create({
      model: this.textModel,
      input,
      previous_interaction_id: previousInteractionId,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: { ...promptSchema, maxItems },
      },
    });
    const text = this.requireText(interaction.output_text);
    return {
      interactionId: this.requireId(interaction.id),
      items: promptItemsSchema.parse(JSON.parse(text)),
    };
  }

  private async generateImage(
    previousInteractionId: string,
    input: string,
    aspectRatio: "9:16" | "16:9",
  ): Promise<ImageResult> {
    const interaction = await this.client.interactions.create({
      model: this.imageModel,
      input,
      previous_interaction_id: previousInteractionId,
      response_format: {
        type: "image",
        mime_type: "image/png",
        aspect_ratio: aspectRatio,
        image_size: "1K",
      },
    });
    const image = interaction.output_image;
    if (!image?.data) throw new Error("Gemini returned no image.");
    return {
      interactionId: this.requireId(interaction.id),
      data: Buffer.from(image.data, "base64"),
      mimeType: image.mime_type ?? "image/png",
    };
  }

  private requireId(value: string | undefined): string {
    if (!value) throw new Error("Gemini returned no interaction ID.");
    return value;
  }

  private requireText(value: string | undefined): string {
    const text = value?.trim();
    if (!text) throw new Error("Gemini returned no text.");
    return text;
  }
}
