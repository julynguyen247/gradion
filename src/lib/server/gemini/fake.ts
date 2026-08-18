import type { GeminiGateway, PromptItem } from "./gateway";

export interface FakeGatewayOptions {
  characters?: PromptItem[];
  chapters?: PromptItem[];
  failMethod?: keyof FakeGeminiGateway["calls"];
  failAtCall?: number;
  waitForStyle?: Promise<void>;
}

export class FakeGeminiGateway implements GeminiGateway {
  readonly calls = {
    uploadBook: 0,
    startBook: 0,
    generateStyle: 0,
    generateCharacters: 0,
    startImageContext: 0,
    generatePortrait: 0,
    generateChapters: 0,
    startChapterImageContext: 0,
    generateIllustration: 0,
  };

  private sequence = 0;
  private readonly characters: PromptItem[];
  private readonly chapters: PromptItem[];

  constructor(private readonly options: FakeGatewayOptions = {}) {
    this.characters = options.characters ?? [
      { name: "Mole", prompt: "An adult Mole in a moss-green waistcoat, warm brown fur, and an earnest expression." },
      { name: "Rat", prompt: "An adult Water Rat in a blue river coat, silver-brown fur, and a confident smile." },
    ];
    this.chapters = options.chapters ?? [
      { name: "The River Bank", prompt: "Mole and Rat meet beside the glittering river in their established clothes." },
    ];
  }

  async uploadBook() {
    this.tick("uploadBook");
    return { name: "files/fake-book", uri: "gemini://fake-book" };
  }

  async startBook() {
    this.tick("startBook");
    return this.id("book");
  }

  async generateStyle(_previous: string, requestedStyle?: string) {
    this.tick("generateStyle");
    if (this.options.waitForStyle) await this.options.waitForStyle;
    return { interactionId: this.id("style"), text: requestedStyle || "Storybook gouache" };
  }

  async generateCharacters() {
    this.tick("generateCharacters");
    return { interactionId: this.id("characters"), items: this.characters };
  }

  async startImageContext() {
    this.tick("startImageContext");
    return this.id("image-context");
  }

  async generatePortrait(_previous: string, character: PromptItem) {
    this.tick("generatePortrait");
    return {
      interactionId: this.id(`portrait-${character.name}`),
      data: Buffer.from(`portrait:${character.name}`),
      mimeType: "image/png",
    };
  }

  async generateChapters() {
    this.tick("generateChapters");
    return { interactionId: this.id("chapters"), items: this.chapters };
  }

  async startChapterImageContext() {
    this.tick("startChapterImageContext");
    return this.id("chapter-context");
  }

  async generateIllustration(_previous: string, chapter: PromptItem) {
    this.tick("generateIllustration");
    return {
      interactionId: this.id(`illustration-${chapter.name}`),
      data: Buffer.from(`illustration:${chapter.name}`),
      mimeType: "image/png",
    };
  }

  private tick(method: keyof FakeGeminiGateway["calls"]): void {
    this.calls[method] += 1;
    if (this.options.failMethod === method && this.calls[method] === (this.options.failAtCall ?? 1)) {
      throw new Error(`Fake ${method} failure`);
    }
  }

  private id(label: string): string {
    this.sequence += 1;
    return `fake-${label}-${this.sequence}`;
  }
}
