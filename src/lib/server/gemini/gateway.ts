export interface PromptItem {
  name: string;
  prompt: string;
}

export interface UploadedBook {
  name: string;
  uri: string;
}

export interface TextResult {
  interactionId: string;
  text: string;
}

export interface PromptListResult {
  interactionId: string;
  items: PromptItem[];
}

export interface ImageResult {
  interactionId: string;
  data: Uint8Array;
  mimeType: string;
}

export interface GeminiGateway {
  uploadBook(filePath: string): Promise<UploadedBook>;
  startBook(fileUri: string): Promise<string>;
  generateStyle(previousInteractionId: string, requestedStyle?: string): Promise<TextResult>;
  generateCharacters(previousInteractionId: string): Promise<PromptListResult>;
  startImageContext(title: string, style: string): Promise<string>;
  generatePortrait(previousInteractionId: string, character: PromptItem): Promise<ImageResult>;
  generateChapters(previousInteractionId: string): Promise<PromptListResult>;
  startChapterImageContext(previousInteractionId: string): Promise<string>;
  generateIllustration(previousInteractionId: string, chapter: PromptItem): Promise<ImageResult>;
}
