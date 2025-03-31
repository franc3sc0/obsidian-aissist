export interface AIssistSettings {
    openAIAPIKey: string;
    openAIChatModel: string;
    openAIMaxTokens: number;
    openAIChatFrequencyPenalty: number;
    openAIChatN: number;
    openAIChatPresencePenalty: number;
    openAIChatTemperature: number;
    openAIChatTopP: number;
    promptHead: string;
    maxPreviousMessages: number;
    openAIStreamChat: boolean;
}

export const DEFAULT_SETTINGS: AIssistSettings = {
    openAIAPIKey: "Your key",
    openAIChatModel: "gpt-4o",
    openAIMaxTokens: 1000,
    openAIChatFrequencyPenalty: 0,
    openAIChatN: 1,
    openAIChatPresencePenalty: 0,
    openAIChatTemperature: 0.7,
    openAIChatTopP: 1,
    promptHead: "//",
    maxPreviousMessages: 10,
    openAIStreamChat: false,
}