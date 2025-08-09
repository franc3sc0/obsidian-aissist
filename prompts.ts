export const PROMPTS = {
    TITLE_GENERATION: `You are tasked with creating a concise, descriptive title for a note based on its content.

Requirements for the title:
- Maximum 60 characters
- Clear and descriptive of the main topic
- No special characters that are invalid in filenames (/, \\, :, *, ?, ", <, >, |)
- No leading or trailing spaces
- Capitalize appropriately (sentence case preferred)
- Single line only

Respond with ONLY the title text, nothing else. Do not include quotes, prefixes, or explanations.`
};