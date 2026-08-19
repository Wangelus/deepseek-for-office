/* ============================================
   提示词构建器
   快捷操作提示词 + 文档上下文拼装 + 动作标签。

   扩展点：
   - M2.2 长文本分段：新增 buildLongTextMapPrompt() / buildLongTextReducePrompt()
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
   * 长文本 Map 阶段提示词（第 N/M 段元信息 + 模式指令）
   * @param {'summarize'|'proofread'} mode
   */
  buildLongTextMapPrompt(mode, segment, index, total) {
    if (mode === 'summarize') {
      return `[这是文档的第 ${index}/${total} 段]\n请提取以下文本的核心要点，用简洁的条目列出（每点一行，直接输出要点，不要寒暄）：\n\n${segment}`;
    }
    return `[这是文档的第 ${index}/${total} 段]\n请校对以下文本的语法、用词与流畅度，直接输出校对后的完整文本，不要任何解释：\n\n${segment}`;
  }

  /**
   * 长文本 Reduce 阶段提示词（层级摘要）
   */
  buildLongTextReducePrompt(mode, mergedResults) {
    return `以下是文档各段的要点汇总。请基于这些要点生成层级摘要，严格按以下结构输出，不要任何多余内容：\n\n## 一句话结论\n（一句话概括全文）\n\n## 核心要点\n1. 要点一\n2. 要点二\n3. 要点三\n\n各段要点如下：\n\n${mergedResults}`;
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

  /**
   * 扩写提示词：目标字数 + 风格 few-shot（原文前 200 字）
   * @param {string} text 原文
   * @param {number} targetCount 目标字数
   */
  buildExpandPrompt(text, targetCount) {
    return `请将以下内容扩写到约 ${targetCount} 字，保持原文风格与信息完整性（参考原文前 200 字的语气与用词习惯）：\n\n[风格示例]\n${text.slice(0, 200)}\n\n[待扩写内容]\n${text}`;
  }

  /**
   * 略写提示词：目标字数 + 风格 few-shot（原文前 200 字）
   * @param {string} text 原文
   * @param {number} targetCount 目标字数
   */
  buildCondensePrompt(text, targetCount) {
    return `请将以下内容压缩到约 ${targetCount} 字，保留核心信息与关键数据（参考原文前 200 字的语气与用词习惯）：\n\n[风格示例]\n${text.slice(0, 200)}\n\n[待压缩内容]\n${text}`;
  }
}
