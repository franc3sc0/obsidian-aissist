export interface AIssistSettings {
    openAIAPIKey: string;
    openAIResponseModel: string;
    openAIMaxOutputTokens: number; 
    openAIResponseTemperature: number;
    promptHead: string;
    maxPreviousMessages: number;
    openAIStreamChat: boolean;
}

export const DEFAULT_SETTINGS: AIssistSettings = {
    openAIAPIKey: "Your key",
    openAIResponseModel: "gpt-4o",
    openAIMaxOutputTokens: 1000, 
    openAIResponseTemperature: 0.7,
    promptHead: "//",
    maxPreviousMessages: 10,
    openAIStreamChat: false,
}