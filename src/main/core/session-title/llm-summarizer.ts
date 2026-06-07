import { requestOpenAiCompatibleChat } from '@main/core/maas/openai-compatible-chat';
import { log } from '@main/lib/logger';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_INPUT_CHARS = 4_000;
const MAX_TITLE_CHARS = 24;

const SYSTEM_PROMPT = [
  '你是一个标题压缩器。读取用户提交给编码 agent 的首条 prompt，输出一个最短、最准确的中文标题。',
  '硬性要求：',
  '- 仅输出标题文本，不要引号、不要标点、不要解释',
  '- 长度 4-12 个汉字（或等量英文单词），上限 24 字符',
  '- 用动词短语，命名要点（修复 X / 调研 Y / 重构 Z）',
  '- 保留专有名词原样（人名、产品名、库名、API 名、文件路径片段）',
  '- 不要总结成空泛词（如"代码修改"、"解决问题"）',
].join('\n');

export async function summarizeTitle(prompt: string): Promise<string | undefined> {
  const cleaned = prompt.trim();
  if (!cleaned) return undefined;
  const truncated = cleaned.length > MAX_INPUT_CHARS ? cleaned.slice(0, MAX_INPUT_CHARS) : cleaned;

  try {
    const response = await requestOpenAiCompatibleChat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: truncated },
      ],
      maxTokens: 64,
      temperature: 0.2,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    return normalizeTitle(response?.content);
  } catch (error) {
    log.warn('llm-summarizer: request failed', { error: String(error) });
    return undefined;
  }
}

function normalizeTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const stripped = raw
    .replace(/^[\s"'“”‘’`]+|[\s"'“”‘’`。.!?！？]+$/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  if (!stripped) return undefined;
  if (stripped.length > MAX_TITLE_CHARS) {
    return stripped.slice(0, MAX_TITLE_CHARS);
  }
  return stripped;
}
