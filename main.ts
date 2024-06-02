import { Plugin, Editor, Notice, PluginSettingTab, App, Setting } from "obsidian";
import { AIssistSettings, DEFAULT_SETTINGS } from "./settings";

interface OpenAIChatRequestParams {
	model: string; // ID of the model to use. 
	frequency_penalty: number | null; // Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.
	max_tokens: number | null; // The maximum number of tokens to generate in the chat completion.
	n: number | null; // How many chat completion choices to generate for each input message.
	presence_penalty: number | null; // Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.
	temperature: number | null; // What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.
	top_p: number | null; // An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered.
	system_message: string;
}

interface OpenAIChatMessage {
	role: string;
	content: string;
}

interface OpenAIChatCompletion {
	id: string; // A unique identifier for the chat completion.
	choices: Array<{ // A list of chat completion choices. Can be more than one if n is greater than 1.
		message?: OpenAIChatMessage; // A chat completion message generated by the model.
		index?: number; // The index of the choice in the list of choices.
		finish_reason?: string; // The reason the model stopped generating tokens. Optional.
	}>;
	created: number; // The Unix timestamp (in seconds) of when the chat completion was created.
	model: string; // The model used for the chat completion.
	system_fingerprint: string; // This fingerprint represents the backend configuration that the model runs with.
	object: string; // The object type, which is always "chat.completion".
	usage: { // Usage statistics for the completion request.
		completion_tokens: number; // Number of tokens in the generated completion.
		prompt_tokens: number; // Number of tokens in the prompt.
		total_tokens: number; // Total number of tokens used in the request (prompt + completion).
	};
}

const OPENAI_CHAT_API_URL = "https://api.openai.com/v1/chat/completions";
const OPEN_AI_CHAT_SYSTEM_MESSAGE = "You are a helpful assistant";
const MARKER_START = "%% AIssist";
const MARKER_END = "%%";
const USER_EMOJI = ":technologist:";
/*
const COMMENT_BLOCK = "> [!note]+ Comment\n> "; // Obsidian Callouts: https://help.obsidian.md/Editing+and+formatting/Callouts
const COMMENT_BLOCK_REGEX = /^> \[!note\]\+ Comment\n(> .*?\n)+/gm;
*/


/*
* PLUGIN FUNCTIONALITY
*/
export default class AIssist extends Plugin {
	settings: AIssistSettings;

	/* parsePrompt
	*/
	parsePrompt(editor: Editor): { cursorPos: CodeMirror.Position; message: OpenAIChatMessage[] } {
		console.debug("[AIssist] Function: parsePrompt");

		let rawPrompt = "";
		let formattedPrompt = "";
		let promptStartIndex = -1;

		// Check for selected text first
		const selection = editor.getSelection();

		if (selection) {
			rawPrompt = selection;

			// Prepend delimiter and format prompt as Markdown quote and append new line
			formattedPrompt = `> ${MARKER_START}; role:user; ${this.insertTimestamp()} ${MARKER_END}${USER_EMOJI}\n` +
				rawPrompt.split('\n').map(line => `> ${line}`).join('\n') + "\n";

			// Replace the selected text with formatted prompt.
			editor.replaceSelection(formattedPrompt);

		} else {
			const cursor = editor.getCursor();
			// Get the content before the cursor
			const contentBeforeCursor = editor.getRange({ line: 0, ch: 0 }, cursor);

			// Define regular expressions to find code blocks and prompt heads
			const codeBlockRegex = /```[^]*?```/g;
			const promptHeadRegex = new RegExp(this.settings.promptHead, "g");

			// Strip code block contents from the search space
			const contentWithoutCodeBlocks = contentBeforeCursor.replace(codeBlockRegex, match =>
				// Replace the code block content with a same-length string of spaces to preserve indices
				" ".repeat(match.length)
			);

			// Find the last prompt head outside of code blocks
			let match;
			while ((match = promptHeadRegex.exec(contentWithoutCodeBlocks)) !== null) {
				promptStartIndex = match.index; // Update last seen position of the prompt
			}

			if (promptStartIndex === -1) {
				// No prompt delimiter found outside of code blocks  
				console.warn("[AIssist] No prompt delimiter found.")
				new Notice(`No prompt found! Either select the prompt, or prepend it with "${this.settings.promptHead}"`);
				throw new Error("No prompt delimiter found.");
			} else {
				// Extract the rawPrompt from the whole content using the adjusted startIndex
				rawPrompt = contentBeforeCursor.substring(promptStartIndex + this.settings.promptHead.length).trim();
			}

			// Prepend delimiter and format prompt as Markdown quote and append new line
			formattedPrompt = `> ${MARKER_START}; role:user; ${this.insertTimestamp()} ${MARKER_END}${USER_EMOJI}\n` +
				rawPrompt.split('\n').map(line => `> ${line}`).join('\n') + "\n";

			// Calculate start position for replacement based on where "//" was found.
			const promptStartPos = editor.offsetToPos(promptStartIndex);

			// Calculate end position by using length of original unformatted prompt
			const promptEndPos = editor.offsetToPos(editor.posToOffset(promptStartPos) + formattedPrompt.length);

			// Replace raw prompt with formatted one in Editor
			editor.replaceRange(formattedPrompt, promptStartPos, promptEndPos);
			editor.setCursor({ line: promptStartPos.line + formattedPrompt.split('\n').length, ch: 0 });
		}

		const cursorAfterPrompt = editor.getCursor();

		return {
			cursorPos: cursorAfterPrompt,
			message: [{ "role": "user", "content": rawPrompt }]
		};
	}

	/* parseMessages
	*/
	parseMessages(editorContent: string, maxMessages: number): OpenAIChatMessage[] {
		console.debug("[AIssist] Function: parseMessages");

		// Match each "AIssist" block individually, capturing the role and the corresponding content up to the next "AIssist" block (or the end of the string), without including it in the match.
		const messageRegex = /%% AIssist; role:(.*?);.*?%%(.*?)(?=%% AIssist|$)/gs
		let match: RegExpExecArray | null;

		// Initialize messages array.
		let messages: OpenAIChatMessage[] = [];

		// Use regex to find all matches in the editor content.
		while ((match = messageRegex.exec(editorContent)) !== null) {
			if (match.index === messageRegex.lastIndex) {
				messageRegex.lastIndex++;
			}

			// Extract role and content from matches.
			const role = match[1].trim();
			let content = match[2];

			// Remove any leading occurrence of "${USER_EMOJY}\n" from content
			//const leadingUserEmojiPattern = new RegExp('^' + USER_EMOJI + '\n');
			const leadingUserEmojiPattern = new RegExp('^' + USER_EMOJI);
			content = content.replace(leadingUserEmojiPattern, '');

			// Remove any leading/trailing spaces and new-line characters from content
			content = content.trim();

			// Remove leading or trailing ">" characters
			const leadingTrailingPattern = new RegExp(/^>|>$/g);
			content = content.replace(leadingTrailingPattern, '');

			// Remove any leading/trailing spaces and new-line characters from content
			content = content.trim();

			// Append the message with role and content data to the messages array.
			messages.push({ role, content });
		}

		// If the number of messages is greater than maxMessages,
		// keep only the last maxMessages number of non-system messages while retaining all system messages.
		if (messages.length > maxMessages) {
			// Filter out system messages
			const systemMessages = messages.filter(message => message.role === 'system');

			// Calculate the number of non-system messages to include
			const remainingSlots = maxMessages - systemMessages.length;

			// Get the last remainingSlots number of non-system messages if any slots remain.
			const nonSystemMessages = remainingSlots > 0
				? messages.filter(message => message.role !== 'system').slice(-remainingSlots)
				: [];

			// Concatenate system messages and non-system messages while preserving the order
			messages = [...systemMessages, ...nonSystemMessages];
		}

		return messages;
	}

	prepareOpenAIChatCompletionRequest(editor: Editor): OpenAIChatRequestParams {

		try {
			// Get file Frontmatter from workspace
			const noteFile = this.app.workspace.getActiveFile();

			if (!noteFile) {
				throw new Error("[AIssist] No active note");
			}

			const noteFrontmatter = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;

			let model;
			let frequency_penalty;
			let max_tokens;
			let n;
			let presence_penalty;
			let temperature;
			let top_p;
			let system_message;

			// Parameters that appear and are changeable in Frontmatter:

			// model
			if (noteFrontmatter?.aissist_openai_chat_model !== undefined) { // If defined in Frontmatter...
				model = noteFrontmatter.aissist_openai_chat_model; // ... use its value.
			} else if (this.settings.openAIChatModel !== undefined) { // If not defined in Frontmatter but defined in Settings...
				model = this.settings.openAIChatModel; // ... use its value,
				this.insertFrontmatterProperty(editor, "aissist_openai_chat_model", model); // and write it to Frontmatter
			} else {
				model = DEFAULT_SETTINGS.openAIChatModel; // Otherwise fall back to default value, 
				this.insertFrontmatterProperty(editor, "aissist_openai_chat_model", model); // and write it to Frontmatter
			}

			// max_tokens
			if (noteFrontmatter?.aissist_openai_chat_max_tokens !== undefined) {
				max_tokens = noteFrontmatter.aissist_openai_chat_max_tokens;
			} else if (this.settings.openAIMaxTokens !== undefined) {
				max_tokens = this.settings.openAIMaxTokens;
				this.insertFrontmatterProperty(editor, "aissist_openai_chat_max_tokens", max_tokens);
			} else {
				max_tokens = DEFAULT_SETTINGS.openAIMaxTokens;
				this.insertFrontmatterProperty(editor, "aissist_openai_chat_max_tokens", max_tokens);
			}

			// temperature
			if (noteFrontmatter?.aissist_openai_chat_temperature !== undefined) {
				temperature = noteFrontmatter.aissist_openai_chat_temperature;
			} else if (this.settings.openAIChatTemperature !== undefined) {
				temperature = this.settings.openAIChatTemperature;
				this.insertFrontmatterProperty(editor, "aissist_openai_chat_temperature", temperature);
			} else {
				temperature = DEFAULT_SETTINGS.openAIChatTemperature;
				this.insertFrontmatterProperty(editor, "aissist_openai_chat_temperature", temperature);
			}

			// system_message
			if (noteFrontmatter?.aissist_openai_chat_system_message !== undefined) {
				system_message = noteFrontmatter.aissist_openai_chat_system_message;
			} else {
				system_message = OPEN_AI_CHAT_SYSTEM_MESSAGE;
				this.insertFrontmatterProperty(editor, "aissist_openai_chat_system_message", system_message);
			}

			// Parameters that do not appear by default but are settable in Frontmatter:

			if (noteFrontmatter?.aissist_openai_chat_frequency_penalty !== undefined) {
				frequency_penalty = noteFrontmatter.aissist_openai_chat_frequency_penalty;
			} else {
				frequency_penalty = DEFAULT_SETTINGS.openAIChatFrequencyPenalty;
			}

			if (noteFrontmatter?.aissist_openai_chat_n !== undefined) {
				n = noteFrontmatter.aissist_openai_chat_n;
			} else {
				n = DEFAULT_SETTINGS.openAIChatN;
			}

			if (noteFrontmatter?.aissist_openai_chat_presence_penalty !== undefined) {
				presence_penalty = noteFrontmatter.aissist_openai_chat_presence_penalty;
			} else {
				presence_penalty = DEFAULT_SETTINGS.openAIChatPresencePenalty;
			}


			if (noteFrontmatter?.aissist_openai_chat_top_p !== undefined) {
				top_p = noteFrontmatter.aissist_openai_chat_top_p;
			} else {
				top_p = DEFAULT_SETTINGS.openAIChatTopP;
			}

			const OpenAIChatRequestParams = {
				"model": model,
				"frequency_penalty": frequency_penalty,
				"max_tokens": max_tokens,
				"n": n,
				"presence_penalty": presence_penalty,
				"temperature": temperature,
				"top_p": top_p,
				"system_message": system_message,
			};

			return OpenAIChatRequestParams;

		} catch (err) {
			throw new Error("[AIssist] Error preparing OpenAI Chat Request object");
		}
	}

	/* requestOpenAIChatCompletion
	*/
	async requestOpenAIChatCompletion(requestParams: OpenAIChatRequestParams, conversation: OpenAIChatMessage[]): Promise<OpenAIChatCompletion> {
		console.debug("[AIssist] Function: requestOpenAIChatCompletion");

		// Check if system_message is set and add a new message accordingly
		if (requestParams.system_message) {
			const systemMessage: OpenAIChatMessage = {
				role: "system",
				content: requestParams.system_message,
			};

			// Insert the new element at the beginning of the array
			conversation.unshift(systemMessage);
		}

		const requestData = {
			"model": requestParams.model,
			"frequency_penalty": requestParams.frequency_penalty,
			"max_tokens": requestParams.max_tokens,
			"n": requestParams.n,
			"presence_penalty": requestParams.presence_penalty,
			"temperature": requestParams.temperature,
			"top_p": requestParams.top_p,
			"messages": conversation
		}

		try {
			console.log("[AIssist] Requesting OpenAI Chat Completion with data: ", requestData);
			const rawResponse = await fetch(OPENAI_CHAT_API_URL, {
				method: `POST`,
				headers: {
					"Authorization": `Bearer ${this.settings.openAIAPIKey}`,
					"Content-Type": "application/json"
				},
				body: JSON.stringify(requestData)
			});

			if (!rawResponse.ok) {
				throw new Error(`[AIssist] HTTP error with status: ${rawResponse.status}`);
			}

			const jsonResponse: OpenAIChatCompletion = await rawResponse.json();
			return jsonResponse;

		} catch (error) {
			console.error("[AIssist] Request failed with error: ", error);
			throw error;
		}
	}

	/* Variation of requestOpenAIChatCompletion that is supposed to work with "stream" set to true. It is untested.
	*/
	/*
	async requestOpenAIChatCompletion(conversation: OpenAIChatMessage[]): Promise<OpenAIChatCompletion[]> {
		console.debug("[AIssist] Function: requestOpenAIChatCompletion");
	
		let data = {
			model: this.settings.openAIChatModel,
			messages: conversation,
			stream: true // Enable stream mode
		};
	
		const OPENAI_CHAT_API_URL = 'api endpoint here'; // Replace with actual API endpoint
	
		try {
			const rawResponse = await fetch(OPENAI_CHAT_API_URL, {
				method: `POST`,
				headers: {
					"Authorization": `Bearer ${this.settings.openAIAPIKey}`,
					"Content-Type": "application/json"
				},
				body: JSON.stringify(data)
			});
	
			if (!rawResponse.body) {
				throw new Error('ReadableStream not available on the response.');
			}
	
			const reader = rawResponse.body.getReader();
			const streamCompletions: OpenAIChatCompletion[] = [];
	
			// This function will be called with each chunk of data received
			const processChunk = async ({ done, value }: ReadableStreamDefaultReadResult<Uint8Array>): Promise<void> => {
				if (done) {
					console.debug("[AIssist] Stream complete");
					return;
				}
	
				// Convert the uint8 array to a string. This assumes the text is UTF-8 encoded
				const text = new TextDecoder().decode(value);
				// Parse the chunk and push to the completions array
				try {
				  const jsonResponse: OpenAIChatCompletion = JSON.parse(text);
				  streamCompletions.push(jsonResponse);
				} catch (error) {
				  console.error("[AIssist] JSON parse error: ", error);
				}
				// Read the next chunk (if available)
				return reader.read().then(processChunk);
			};
	
			await reader.read().then(processChunk);
	
			return streamCompletions;
	
		} catch (error) {
			console.error("[AIssist] Request failed:", error);
			throw error;
		}
	}
	*/

	/* insertResponse
	*/
	async insertResponse(editor: Editor, cursorAfterPrompt: CodeMirror.Position, requestParams: OpenAIChatRequestParams, conversation: OpenAIChatMessage[]): Promise<void> {
		console.debug("[AIssist] Function: insertResponse");

		try {
			const responseJson = await this.requestOpenAIChatCompletion(requestParams, conversation);

			if (responseJson.choices && responseJson.choices.length > 0 && responseJson.choices[0].message) {
				let replyContent: string = responseJson.choices[0].message.content;

				// Prepend response with AIssist delimiter and Chat Completions role
				let prefix = `\n${MARKER_START}; role:assistant; ${MARKER_END} `;
				replyContent = prefix + replyContent;

				// Insert the AI response
				editor.replaceRange(replyContent, editor.getCursor());
				let lines = replyContent.split('\n').length;
				editor.setCursor({ line: cursorAfterPrompt.line + lines, ch: 0 });

				// Get active note's Frontmatter
				const noteFile = this.app.workspace.getActiveFile();
				if (!noteFile) {
					throw new Error("[AIssist] No active note");
				}

				const noteFrontmatter = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;

				// Update Frontmatter properties with new token counts
				const updateProperty = (prop: string, tokens: number) => {
					let value = noteFrontmatter && noteFrontmatter[prop] ? noteFrontmatter[prop] + tokens : tokens;
					this.insertFrontmatterProperty(editor, prop, value);
				};

				// Completion, Prompt and Total tokens need to be updated
				updateProperty('aissist_openai_chat_completion_tokens', responseJson.usage.completion_tokens);
				updateProperty('aissist_openai_chat_prompt_tokens', responseJson.usage.prompt_tokens);
				updateProperty('aissist_openai_chat_total_tokens', responseJson.usage.total_tokens);
			}
		} catch (error) {
			console.error("[AIssist] Inserting Chat Completion failed with error:", error);
			new Notice("[AIssist] Error inserting chat completion.");
		}
	}


	/* insertTimestamp
	*/
	insertTimestamp(): string {
		console.debug("[AIssist] Function: insertTimestamp");

		const date = new Date();
		const year = date.getFullYear();
		const month = date.getMonth().toString().padStart(2, '0');
		const day = date.getDate().toString().padStart(2, '0');
		const hour = date.getHours().toString().padStart(2, '0');
		const minute = date.getMinutes().toString().padStart(2, '0');

		return `${year}-${month}-${day}T${hour}:${minute}`;
	}

	/* insertFrontmatterProperty
	*/
	insertFrontmatterProperty(editor: Editor, property: string, propertyValue: any) {  // may consider limiting propertyValue type to actually supported Properties types
		console.debug("[AIssist] Function: insertFrontmatterProperty");

		try {
			// Use a regular expression to match the existing Frontmatter
			const frontmatterRegex = /^---\n([\s\S]*?)\n---/;

			const editorContent = editor.getValue();
			const propertyToInsert = `${property}: ${propertyValue}\n`;
			let newContent;

			if (frontmatterRegex.test(editorContent)) {
				// Update existing frontmatter
				newContent = editorContent.replace(frontmatterRegex, (frontmatter) => {
					// Add property before closing ---
					return frontmatter.replace(/\n---/, `\n${propertyToInsert}---`);
				});
			} else {
				// Insert new Frontmatter at the beginning, if not present
				newContent = `---\n${propertyToInsert}---\n${editorContent}`;
			}

			editor.setValue(newContent);
			// new Notice("[AIssist] Property inserted or updated in YAML frontmatter");

		} catch (error) {
			console.error("[AIssist] Error inserting or updating property:", error);
			new Notice("[AIssist] Failed to insert or update property in YAML frontmatter!");
		}
	}

	/* loadSettings
	*/
	async loadSettings() {
		console.debug("[AIssist] Function: loadSettings");

		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/* saveSettings
	*/
	async saveSettings() {
		console.debug("[AIssist] Function: saveSettings");

		await this.saveData(this.settings);
	}

	async onload() {
		await this.loadSettings();

		/* Prompt command
		*/
		this.addCommand({
			id: "prompt-completion-request",
			name: "Prompt",
			icon: "message-circle",
			editorCallback: async (editor: Editor) => {

				// Pull all request parameters and create/update frontmatter, as relevant
				const requestParams = this.prepareOpenAIChatCompletionRequest(editor); // >> any problem with prompt because of frontmatter ?

				// Parse prompt
				const { cursorPos, message } = this.parsePrompt(editor);

				// Query OpenAI and insert chat completion
				await this.insertResponse(editor, cursorPos, requestParams, message);
			}
		})

		/* Chat command
		*/
		this.addCommand({
			id: "chat-completion-request",
			name: "Chat",
			icon: "message-circle",
			editorCallback: async (editor: Editor) => {

				// Pull all request parameters and create/update frontmatter, as relevant
				const requestParams = this.prepareOpenAIChatCompletionRequest(editor); // >> any problem with prompt because of frontmatter ?

				// Parse prompt
				const { cursorPos, message } = this.parsePrompt(editor);

				// parseMessages
				const messages = this.parseMessages(editor.getValue(), this.settings.maxPreviousMessages);

				// Query OpenAI and insert chat completion
				await this.insertResponse(editor, cursorPos, requestParams, messages);
			}
		})

		this.addSettingTab(new AIssistSettingTab(this.app, this));
	}
}

/*
* PLUGIN SETTINGS
*/
class AIssistSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: AIssist) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h1", {
			text: "Settings for AIssist",
		});

		new Setting(containerEl)
			.setName("OpenAI API key")
			//.setDesc("Enter the API key for OpenAI")
			.addText(text => text
				.setPlaceholder("Your OpenAPI key")
				.setValue(this.plugin.settings.openAIAPIKey)
				.onChange(async (value) => {
					this.plugin.settings.openAIAPIKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("OpenAI Chat API model")
			.setDesc("See [model endpoint compatibility](https://platform.openai.com/docs/models/model-endpoint-compatibility) for available models")
			.addText(text => text
				.setValue(this.plugin.settings.openAIChatModel)
				.onChange(async (value) => {
					this.plugin.settings.openAIChatModel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Maximum number of tokens to generate in the chat completion")
			.setDesc("Response will be truncated if it exceeds this value. Max. allowed value is 4096.")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.openAIMaxTokens.toString())
				.setValue(this.plugin.settings.openAIMaxTokens.toString())
				.onChange(async (value) => {
					this.plugin.settings.openAIMaxTokens = parseInt(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Prompt start delimiter")
			.setDesc("Character combination that marks the beginning of a prompt; choose something that is unlikely to occur in your notes.")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.promptHead)
				.setValue(this.plugin.settings.promptHead)
				.onChange(async (value) => {
					this.plugin.settings.promptHead = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Maximum number of previous messages passed to chat")
			.setDesc("Excess messages will be ignored.")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.maxPreviousMessages.toString())
				.setValue(this.plugin.settings.maxPreviousMessages.toString())
				.onChange(async (value) => {
					this.plugin.settings.maxPreviousMessages = parseInt(value);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Stream responses")
			.setDesc("If set, partial message deltas will be sent, like in ChatGPT.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openAIStreamChat)
				.onChange(async (value) => {
					this.plugin.settings.openAIStreamChat = value;
					await this.plugin.saveSettings();
				}));
	}
}