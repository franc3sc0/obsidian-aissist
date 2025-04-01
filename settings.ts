export interface AIssistSettings {
    openAIAPIKey: string;
    openAIResponseModel: string;
    openAIMaxOutputTokens: number; 
    promptHead: string;
    maxPreviousMessages: number;
    openAIStreamResponse: boolean;
}

export const DEFAULT_SETTINGS: AIssistSettings = {
    openAIAPIKey: "Your key",
    openAIResponseModel: "gpt-4o",
    openAIMaxOutputTokens: 1000, 
    promptHead: "//",
    maxPreviousMessages: 10,
    openAIStreamResponse: false,
}