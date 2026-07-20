// ========== AI 统一适配器 ==========
export function buildAIRequest(config, messages) {
  const baseUrl = config.baseUrl;
  const path = config.path || "/v1/chat/completions";

  // ===== Claude / Anthropic =====
  if (baseUrl.includes("anthropic")) {
    return {
      url: baseUrl + path,
      headers: {
        "x-api-key": config.key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: {
        model: config.model,
        max_tokens: 4096,
        messages: messages
      },
      type: "claude"
    };
  }

  // ===== OpenAI / DeepSeek / GLM / Grok =====
  return {
    url: baseUrl + path,
    headers: {
      "Authorization": `Bearer ${config.key}`,
      "Content-Type": "application/json"
    },
    body: {
      model: config.model,
      messages: messages,
      temperature: 0.7
    },
    type: "openai"
  };
}
