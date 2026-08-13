/* ============================================
   提示词构建器
   快捷操作提示词 + 文档上下文拼装 + 动作标签。

   扩展点：
   - M2.3 扩写/略写：新增 buildExpandPrompt() / buildCondensePrompt()
   - M3 Skill 系统：新增 compileSkillPrompt(skill, context)，
     快捷操作表可被 Skill 的 system_prompt 覆盖
   ============================================ */

export const SYSTEM_PROMPT = `You are a professional writing assistant integrated into Microsoft Word. You help users with:
- Proofreading and polishing text for grammar, clarity, style, and flow
- Drafting new content based on user instructions
- Translating text between Chinese and English (and other languages)
- Summarizing document content concisely

Guidelines:
- Respond in the same language as the user's query
- When proofreading, show corrections clearly with explanations
- When given document text to work with, reference it directly
- Use Markdown formatting for readability (but keep it clean)
- Be concise and helpful — don't over-explain unless asked`;

export class PromptBuilder {

  /**
   * 系统提示词（M3 Skill 系统接入后，此处可返回激活 Skill 的 system_prompt）
   */
  buildSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  /**
   * 快捷操作提示词
   * @param {'proofread'|'draft'|'translate'|'summarize'|string} action
   * @param {string} docText 文档选中文本（可能为空字符串）
   */
  buildQuickActionPrompt(action, docText) {
    const prompts = {
      proofread: `Please proofread and polish the following text.
Fix grammar, improve clarity and flow, and suggest better word choices where appropriate.
Show the corrected version and explain your changes briefly.

Text to proofread:
${docText || '(Please select text in the document first, then click 校对 again)'}`,

      draft: `The user wants to draft new content.
Help them write based on their needs. If no specific topic was provided,
ask them what they'd like to write about.

User context: ${docText || '(No document text selected)'}
Instruction: Draft content based on what the user needs.`,

      translate: `Translate the following text.
If it's in Chinese, translate to English. If it's in English, translate to Chinese.
If it's in another language, translate to Chinese.

Text to translate:
${docText || '(Please select text in the document first, then click 翻译 again)'}`,

      summarize: `Summarize the following text concisely.
Provide key points in bullet format and a one-sentence overall summary.

Text to summarize:
${docText || '(Please select text in the document first, then click 总结 again)'}`
    };

    return prompts[action] || prompts.draft;
  }

  /**
   * 快捷操作按钮的中文标签
   */
  getActionLabel(action) {
    const labels = {
      proofread: '🔍 校对润色',
      draft: '✍️ 起草内容',
      translate: '🌐 翻译',
      summarize: '📋 总结要点'
    };
    return labels[action] || action;
  }

  /**
   * 将选中文本作为文档上下文包裹进用户消息；无选中时原样返回
   */
  buildContextPrompt(selectedText, message) {
    if (!selectedText) return message;

    return `[Document context — selected text from Word document:]
"""
${selectedText}
"""

[User instruction:]
${message}`;
  }
}
