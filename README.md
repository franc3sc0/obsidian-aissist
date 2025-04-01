# AIssist

A Generative AI-based assistant for Obsidian.

## Installation

### Method 1: Community Plugins

Go to Community Plugins and search 'AIssist'.

### Method 2: Local

1. Clone this repo into your `plugins` directory in your Obsidian vault
2. Verify you have NodeJS installed, or install it with `brew install node`.
3. Run `npm i` and `npm run build` in the command line under the plugin folder.

## Configuration

`Obsidian Settings` > `Community plugins` > `AIssist`: 
1. Insert your OpenAI API Key
2. Enter your preferred OpenAI Chat API Model (default: "gpt-4o")

`Obsidian Settings` > `Hotkeys`:
1. (optional) Configure a hotkey for the `Chat` and/or `Prompt` commands

## Usage

Press `Ctrl + p` (or your hotkey of choice) to invoke the Command Palette. The following commands are available for AIssist:
* Prompt
* Chat

For all commands, the **prompt that will be passed to the LLM** is either 
* the currently highlighted text, or 
* the text between a double slash ("//", can be changed in Settings) and the cursor position.

### "Prompt" command
Queries the LLM and returns its answer. The LLM **does not consider the contents of the Note as context** and instead threats the query as an independent request, regardless of other ones already stored in the Note. 

### "Chat" command
Queries the LLM and returns its answer. In providing the answer, the LLM **considers the contents of the Note as context**, similar to ChatGPT's behavior.

### Response API parameters
The following Response API request parameters can be set in the note's Frontmatter:
* `store` (boolean, [reference](https://platform.openai.com/docs/api-reference/responses/create#responses-create-store)) - use property `aissist_openai_response_store`.
* `temperature`(number, [reference](https://platform.openai.com/docs/api-reference/responses/create#responses-create-temperature)) - use property `aissist_openai_response_temperature`.
* `top_p`(number, [reference](https://platform.openai.com/docs/api-reference/responses/create#responses-create-top_p)) - use property `aissist_openai_response_top_p`.

## Upcoming improvements
* Add Status bar items
* Add OpenAI Stop command
* Make user emoji a Setting
* [Bugfix] Inserting a prompt in the middle of text with "selection" method works, but with the prompt delimiter (e.g. "//") doesn't.

## Making changes
1. Verify you have NodeJS installed, or install it with `brew install node`.
2. Copy `main.ts`, `settings.ts`, `manifest.json` , `esbuild.config.mjs` over to your vault (`VaultFolder/.obsidian/plugins/your-plugin-name/`).
3. Run `npm init -y` to create a `package.json` file
4. In `package.json`, replace: 
    * the `"scripts"` section in `package.json` with 
    ```
    "scripts": {
	    "dev": "node esbuild.config.mjs",
	    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
	    "version": "node version-bump.mjs && git add manifest.json versions.json"
	},
    ```
    * "index.js" with "main.ts"
5. Run `npm install --save-dev @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint esbuild typescript builtin-modules obsidian` to install the required packages 
6. Run `npm run dev` to start compilation in watch mode.

### Debugging tips
* Keep the Developer Console open (View > Toggle Developer Tools or Cmd/Ctrl+Shift+I)
* Add `console.debug()` statements in your code to track execution
* Check for errors in the console

## FAQ
