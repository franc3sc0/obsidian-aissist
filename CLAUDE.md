# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development build with watch mode using esbuild
- `npm run build` - Build for production (includes TypeScript type checking)
- `npm i` - Install dependencies

## Project Architecture

This is an Obsidian plugin called "AIssist" that integrates OpenAI's Response API to provide AI assistance directly within Obsidian notes.

### Core Components

- **main.ts** - Main plugin class with two primary commands:
  - `Prompt` command: Single-shot AI queries without conversation context
  - `Chat` command: Conversational AI that maintains context using OpenAI's Response API threading
  - `Title` command: Replace note's title with LLM-generated one 
- **settings.ts** - Plugin settings interface and defaults
- **manifest.json** - Obsidian plugin metadata

### Key Architecture Patterns

**Request Flow:**
1. `parsePrompt()` - Extracts user input from either selected text or text after delimiter (`//` by default)
2. `prepareOpenAIResponseRequest()` - Builds API request using frontmatter properties and settings
3. `requestOpenAIResponse()` - Makes API call to OpenAI Response API 
4. `insertResponse()` - Formats and inserts AI response into note

**Message Format:**
- Uses custom markdown format with `%% AIssist; role:user/assistant; timestamp %%` markers
- Responses include token usage tracking in frontmatter
- Maintains conversation state via `previous_response_id` parameter

**Settings Management:**
- Frontmatter properties override plugin settings for per-note customization
- Automatic frontmatter insertion for tracking model, tokens, and conversation state
- Supports OpenAI Response API parameters: model, max_output_tokens, temperature, top_p, store, vector_store_ids

### Build System

Uses esbuild for bundling with:
- Development: watch mode with inline sourcemaps
- Production: optimized build without sourcemaps
- External dependencies: Obsidian API and CodeMirror modules
- Output: main.js (bundled plugin file)

### OpenAI Integration

Uses OpenAI Response API (not Chat Completions) at `https://api.openai.com/v1/responses` with conversation threading support. The plugin tracks conversation state and token usage in note frontmatter.